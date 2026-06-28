import { NextResponse } from 'next/server'
import { isErrorResponse, requireUserAuth } from '@/lib/api-auth'
import { apiHandler } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import {
  invalidOrganizationIdResponse,
  listActiveOrganizationMemberships,
  readRequestedOrganizationId,
  setCurrentOrganization,
} from '@/lib/saas/current-organization'
import { requireOrganizationRole } from '@/lib/saas/permissions'

const MEMBER_ROLES = ['owner', 'admin', 'member'] as const

function serializeMembership(membership: Awaited<ReturnType<typeof listActiveOrganizationMemberships>>[number]) {
  return {
    id: membership.id,
    organizationId: membership.organizationId,
    role: membership.role,
    joinedAt: membership.joinedAt,
    organization: membership.organization,
  }
}

export const GET = apiHandler(async () => {
  const auth = await requireUserAuth()
  if (isErrorResponse(auth)) return auth

  const [memberships, preference] = await Promise.all([
    listActiveOrganizationMemberships(auth.session.user.id),
    prisma.userPreference.findUnique({
      where: { userId: auth.session.user.id },
      select: { currentOrganizationId: true },
    }),
  ])
  const current = memberships.find((membership) => membership.organizationId === preference?.currentOrganizationId)
    ?? memberships[0]
    ?? null

  return NextResponse.json({
    currentOrganization: current ? serializeMembership(current) : null,
    memberships: memberships.map(serializeMembership),
  })
})

export const POST = apiHandler(async (req) => {
  const auth = await requireUserAuth()
  if (isErrorResponse(auth)) return auth

  let organizationId: string | null
  try {
    const body = await req.json()
    organizationId = readRequestedOrganizationId((body as Record<string, unknown>).organizationId)
  } catch (error) {
    return invalidOrganizationIdResponse(error)
  }

  if (!organizationId) {
    await setCurrentOrganization(auth.session.user.id, null)
    return NextResponse.json({ currentOrganization: null })
  }

  const permission = await requireOrganizationRole(organizationId, auth.session.user.id, [...MEMBER_ROLES])
  if (permission.error) return permission.error

  await setCurrentOrganization(auth.session.user.id, organizationId)

  return NextResponse.json({
    currentOrganization: serializeMembership(permission.membership as Parameters<typeof serializeMembership>[0]),
  })
})
