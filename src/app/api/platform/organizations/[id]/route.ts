import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePlatformAdmin, createAdminAuditLog } from '@/lib/platform-admin'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * DELETE /api/platform/organizations/[id]
 * 删除组织（平台管理员专用）
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const authResult = await requirePlatformAdmin()
  if (authResult instanceof NextResponse) return authResult
  const { user } = authResult

  const { id } = await params

  // 检查组织是否存在
  const org = await prisma.organization.findUnique({
    where: { id },
    include: {
      _count: { select: { members: true } },
    },
  })

  if (!org) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
  }

  // 使用事务删除组织及其关联数据
  await prisma.$transaction(async (tx) => {
    // 删除成员关系
    await tx.organizationMember.deleteMany({ where: { organizationId: id } })
    // 删除余额记录
    await tx.organizationBalance.deleteMany({ where: { organizationId: id } })
    // 删除消费记录
    await tx.organizationUsage.deleteMany({ where: { organizationId: id } })
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
}
