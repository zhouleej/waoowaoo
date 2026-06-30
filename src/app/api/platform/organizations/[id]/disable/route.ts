import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePlatformAdmin, createAdminAuditLog } from '@/lib/platform-admin'
import { apiHandler } from '@/lib/api-errors'

/**
 * POST /api/platform/organizations/[id]/disable
 * 禁用组织
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

  // 如果已经是 disabled 状态，直接返回
  if (organization.status === 'disabled') {
    return NextResponse.json({
      message: 'Organization is already disabled',
      organization,
    })
  }

  // 禁用组织
  const updated = await prisma.organization.update({
    where: { id },
    data: { status: 'disabled' },
  })

  // 记录操作日志
  await createAdminAuditLog({
    adminId: user.id,
    action: 'disable_organization',
    targetType: 'Organization',
    targetId: id,
    details: {
      organizationName: organization.name,
      organizationSlug: organization.slug,
    },
  })

  return NextResponse.json({
    message: 'Organization disabled successfully',
    organization: updated,
  })
})
