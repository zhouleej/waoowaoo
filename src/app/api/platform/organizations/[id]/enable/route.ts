import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePlatformAdmin, createAdminAuditLog } from '@/lib/platform-admin'
import { apiHandler } from '@/lib/api-errors'

/**
 * POST /api/platform/organizations/[id]/enable
 * 启用组织
 */
export const POST = apiHandler<{ id: string }>(async (_req, { params }) => {
  const authResult = await requirePlatformAdmin()
  if (authResult instanceof NextResponse) return authResult

  const { user } = authResult
  const { id } = await params

  // 检查组织是否存在
  const organization = await prisma.organization.findUnique({
    where: { id },
  })

  if (!organization) {
    return NextResponse.json(
      { error: 'Organization not found' },
      { status: 404 }
    )
  }

  // 如果已经是 active 状态，直接返回
  if (organization.status === 'active') {
    return NextResponse.json({
      message: 'Organization is already active',
      organization,
    })
  }

  // 启用组织
  const updated = await prisma.organization.update({
    where: { id },
    data: { status: 'active' },
  })

  // 记录操作日志
  await createAdminAuditLog({
    adminId: user.id,
    action: 'enable_organization',
    targetType: 'Organization',
    targetId: id,
    details: {
      organizationName: organization.name,
      organizationSlug: organization.slug,
    },
  })

  return NextResponse.json({
    message: 'Organization enabled successfully',
    organization: updated,
  })
})
