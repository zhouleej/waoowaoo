import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePlatformAdmin } from '@/lib/platform-admin'

/**
 * GET /api/platform/audit-logs
 * 获取管理员操作日志
 * 查询参数：page, limit, action, adminId
 * 返回：日志列表
 */
export async function GET(req: NextRequest) {
  const authResult = await requirePlatformAdmin()
  if (authResult instanceof NextResponse) return authResult

  const { searchParams } = new URL(req.url)

  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '20')
  const action = searchParams.get('action') || ''
  const adminId = searchParams.get('adminId') || ''

  const where: Record<string, unknown> = {}

  if (action) {
    where.action = action
  }

  if (adminId) {
    where.adminId = adminId
  }

  const [logs, total] = await Promise.all([
    prisma.adminAuditLog.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        admin: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    }),
    prisma.adminAuditLog.count({ where }),
  ])

  const result = logs.map((log) => ({
    id: log.id,
    action: log.action,
    targetType: log.targetType,
    targetId: log.targetId,
    details: log.details ? JSON.parse(log.details) : null,
    ipAddress: log.ipAddress,
    createdAt: log.createdAt,
    admin: {
      id: log.admin.id,
      name: log.admin.name,
      email: log.admin.email,
    },
  }))

  // 获取所有不同的 action 类型
  const actions = await prisma.adminAuditLog.findMany({
    select: { action: true },
    distinct: ['action'],
  })

  return NextResponse.json({
    data: result,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
    filters: {
      actions: actions.map((a) => a.action),
    },
  })
}