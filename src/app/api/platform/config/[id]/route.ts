import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePlatformAdmin, createAdminAuditLog } from '@/lib/platform-admin'
import { apiHandler } from '@/lib/api-errors'

/**
 * DELETE /api/platform/config/[id]
 * 删除指定 ID 的配置项
 */
export const DELETE = apiHandler<{ id: string }>(async (_req, { params }) => {
  const authResult = await requirePlatformAdmin()
  if (authResult instanceof NextResponse) return authResult

  const { user } = authResult
  const { id } = await params

  // 检查配置是否存在
  const config = await prisma.systemConfig.findUnique({
    where: { id },
  })

  if (!config) {
    return NextResponse.json(
      { error: 'Config not found' },
      { status: 404 }
    )
  }

  await prisma.systemConfig.delete({
    where: { id },
  })

  // 记录操作日志
  await createAdminAuditLog({
    adminId: user.id,
    action: 'delete_config',
    targetType: 'SystemConfig',
    targetId: id,
    details: {
      key: config.key,
      value: config.value,
    },
  })

  return NextResponse.json({
    message: 'Config deleted successfully',
  })
})
