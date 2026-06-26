import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { forbidden, notFound } from '@/lib/api-auth'
import type { Prisma } from '@prisma/client'

export type OrganizationRole = 'owner' | 'admin' | 'member'

export async function requireOrganizationRole(
  organizationId: string,
  userId: string,
  roles: OrganizationRole[],
) {
  const membership = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
    include: { organization: true },
  })
  if (!membership) return { error: forbidden('无权访问该企业资源'), membership: null }
  if (membership.organization.status !== 'active') return { error: forbidden('企业已被禁用'), membership }
  if (membership.status !== 'active') return { error: forbidden('成员已被禁用'), membership }
  if (!roles.includes(membership.role as OrganizationRole)) return { error: forbidden('权限不足'), membership }
  return { error: null as NextResponse | null, membership }
}

export async function requireOrganizationExists(organizationId: string) {
  const organization = await prisma.organization.findUnique({ where: { id: organizationId } })
  if (!organization) return { error: notFound('Organization'), organization: null }
  return { error: null as NextResponse | null, organization }
}

export async function writeEnterpriseAudit(params: {
  organizationId?: string | null
  actorId?: string | null
  action: string
  targetType: string
  targetId?: string | null
  summary?: string | null
  details?: Record<string, unknown>
}) {
  return prisma.enterpriseAuditLog.create({
    data: {
      organizationId: params.organizationId || null,
      actorId: params.actorId || null,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId || null,
      summary: params.summary || null,
      details: params.details as Prisma.InputJsonValue | undefined,
    },
  })
}
