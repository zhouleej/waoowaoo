import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { badRequest } from '@/lib/api-auth'
import { requireOrganizationRole, type OrganizationRole } from './permissions'

const MEMBER_ROLES: OrganizationRole[] = ['owner', 'admin', 'member']

type ActiveMembership = {
  id: string
  organizationId: string
  userId: string
  role: string
  status: string
  joinedAt: Date
  organization: {
    id: string
    name: string
    slug: string
    status: string
    businessStatus: string
  }
}

export type CurrentOrganizationContext = {
  organizationId: string | null
  membership: ActiveMembership | null
}

export async function listActiveOrganizationMemberships(userId: string): Promise<ActiveMembership[]> {
  return prisma.organizationMember.findMany({
    where: {
      userId,
      status: 'active',
      organization: { status: 'active' },
    },
    include: {
      organization: {
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          businessStatus: true,
        },
      },
    },
    orderBy: { joinedAt: 'desc' },
  })
}

export async function resolveCurrentOrganization(
  userId: string,
  requestedOrganizationId?: string | null,
  currentOrganizationId?: string | null,
): Promise<CurrentOrganizationContext | { error: NextResponse }> {
  const requestedId = requestedOrganizationId?.trim()

  if (requestedId) {
    const permission = await requireOrganizationRole(requestedId, userId, MEMBER_ROLES)
    if (permission.error) return { error: permission.error }
    return {
      organizationId: requestedId,
      membership: permission.membership as ActiveMembership,
    }
  }

  if (!currentOrganizationId) {
    return { organizationId: null, membership: null }
  }

  const permission = await requireOrganizationRole(currentOrganizationId, userId, MEMBER_ROLES)
  if (permission.error) {
    return { organizationId: null, membership: null }
  }

  return {
    organizationId: currentOrganizationId,
    membership: permission.membership as ActiveMembership,
  }
}

export async function setCurrentOrganization(userId: string, organizationId: string | null) {
  return prisma.userPreference.upsert({
    where: { userId },
    update: { currentOrganizationId: organizationId },
    create: { userId, currentOrganizationId: organizationId },
  })
}

export function readRequestedOrganizationId(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string') {
    throw new Error('organizationId must be a string')
  }
  const trimmed = value.trim()
  return trimmed || null
}

export function invalidOrganizationIdResponse(error: unknown) {
  return badRequest(error instanceof Error ? error.message : 'organizationId is invalid')
}
