import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePlatformAdmin, createAdminAuditLog } from '@/lib/platform-admin'
import { apiHandler } from '@/lib/api-errors'
import { badRequest } from '@/lib/api-auth'
import { ORGANIZATION_BUSINESS_STATUSES, ORGANIZATION_STATUSES, readStringEnum } from '@/lib/platform/validation'

export const GET = apiHandler<{ id: string }>(async (_req, { params }) => {
  const authResult = await requirePlatformAdmin()
  if (authResult instanceof NextResponse) return authResult
  const { id } = await params
  const org = await prisma.organization.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true, email: true, image: true } },
      members: { include: { user: { select: { id: true, name: true, email: true, image: true, isGlobalLocked: true } } } },
      balance: true,
      currentPlan: { include: { entitlements: true } },
      subscriptions: { orderBy: { createdAt: 'desc' }, include: { plan: true, orders: { take: 5, orderBy: { createdAt: 'desc' } } } },
      orders: { take: 10, orderBy: { createdAt: 'desc' }, include: { invoice: true, plan: true } },
      invoices: { take: 10, orderBy: { createdAt: 'desc' }, include: { order: true } },
      organizationUsages: { take: 20, orderBy: { createdAt: 'desc' } },
      auditLogs: { take: 20, orderBy: { createdAt: 'desc' } },
      _count: { select: { members: true, projects: true } },
    },
  })
  if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
  return NextResponse.json({ data: org })
})

export const PATCH = apiHandler<{ id: string }>(async (req, { params }) => {
  const authResult = await requirePlatformAdmin()
  if (authResult instanceof NextResponse) return authResult
  const { user } = authResult
  const { id } = await params
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return badRequest('Request body must be valid JSON')
  }
  const org = await prisma.organization.findUnique({ where: { id } })
  if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
  if (body.name !== undefined && (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 120)) {
    return badRequest('Invalid organization name')
  }
  if (body.settings !== undefined && (typeof body.settings !== 'object' || body.settings === null || Array.isArray(body.settings))) {
    return badRequest('settings must be an object')
  }
  let status: (typeof ORGANIZATION_STATUSES)[number] | undefined
  let businessStatus: (typeof ORGANIZATION_BUSINESS_STATUSES)[number] | undefined
  try {
    status = body.status === undefined ? undefined : readStringEnum(body.status, 'status', ORGANIZATION_STATUSES)
    businessStatus = body.businessStatus === undefined
      ? undefined
      : readStringEnum(body.businessStatus, 'businessStatus', ORGANIZATION_BUSINESS_STATUSES)
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : 'Invalid organization status')
  }
  if (body.name === undefined && status === undefined && businessStatus === undefined && body.settings === undefined) {
    return badRequest('At least one supported organization field is required')
  }
  const updated = await prisma.organization.update({
    where: { id },
    data: {
      ...(typeof body.name === 'string' && body.name.trim() ? { name: body.name.trim() } : {}),
      ...(status !== undefined ? { status } : {}),
      ...(businessStatus !== undefined ? { businessStatus } : {}),
      ...(body.settings !== undefined ? { settings: body.settings } : {}),
    },
    include: { owner: true, balance: true, currentPlan: true },
  })
  await createAdminAuditLog({ adminId: user.id, action: 'update_organization', targetType: 'Organization', targetId: id, details: { changed: Object.keys(body) } })
  return NextResponse.json({ data: updated })
})

/**
 * DELETE /api/platform/organizations/[id]
 * 删除组织（平台管理员专用）
 */
export const DELETE = apiHandler<{ id: string }>(async (_req, { params }) => {
  const authResult = await requirePlatformAdmin()
  if (authResult instanceof NextResponse) return authResult
  const { user } = authResult

  const { id } = await params

  // 检查组织是否存在
  const org = await prisma.organization.findUnique({
    where: { id },
    include: {
      _count: { select: { members: true, projects: true } },
    },
  })

  if (!org) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
  }

  if (org._count.projects > 0) {
    return NextResponse.json({ error: 'Organization still has projects; migrate or delete them before hard deletion' }, { status: 409 })
  }

  // 使用事务删除无项目组织及其关联数据
  await prisma.$transaction(async (tx) => {
    // 删除成员关系
    await tx.organizationMember.deleteMany({ where: { organizationId: id } })
    // 删除余额记录
    await tx.organizationBalance.deleteMany({ where: { organizationId: id } })
    // 删除消费记录
    await tx.organizationUsage.deleteMany({ where: { organizationId: id } })
    await tx.organizationInvitation.deleteMany({ where: { organizationId: id } })
    await tx.enterpriseAuditLog.deleteMany({ where: { organizationId: id } })
    await tx.billingInvoice.deleteMany({ where: { organizationId: id } })
    await tx.billingOrder.deleteMany({ where: { organizationId: id } })
    await tx.organizationSubscription.deleteMany({ where: { organizationId: id } })
    // 删除组织
    await tx.organization.delete({ where: { id } })
  })

  // 记录审计日志
  await createAdminAuditLog({
    adminId: user.id,
    action: 'delete_organization',
    targetType: 'Organization',
    targetId: id,
    details: {
      name: org.name,
      slug: org.slug,
      memberCount: org._count.members,
    },
  })

  return NextResponse.json({ message: 'Organization deleted successfully' })
})
