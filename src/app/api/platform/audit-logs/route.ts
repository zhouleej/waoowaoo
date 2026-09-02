import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePlatformAdmin } from '@/lib/platform-admin'
import { apiHandler } from '@/lib/api-errors'
import { badRequest } from '@/lib/api-auth'
import { readPlatformPagination, safeParseAuditDetails } from '@/lib/platform/validation'

/**
 * GET /api/platform/audit-logs
 * 获取管理员操作日志
 * 查询参数：page, limit, action, adminId
 * 返回：日志列表
 */
export const GET = apiHandler(async (req) => {
  const authResult = await requirePlatformAdmin()
  if (authResult instanceof NextResponse) return authResult

  const { searchParams } = new URL(req.url)

  let page: number
  let limit: number
  let skip: number
  try {
    ({ page, limit, skip } = readPlatformPagination(searchParams, { limit: 20 }))
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : 'Invalid pagination parameters')
  }
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
      skip,
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
    details: safeParseAuditDetails(log.details),
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
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
    filters: {
      actions: actions.map((a) => a.action),
    },
  })
})
