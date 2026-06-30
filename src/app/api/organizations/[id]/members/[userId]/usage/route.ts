import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withPrismaRetry } from '@/lib/prisma-retry'
import { requireUserAuth, isErrorResponse, forbidden, notFound } from '@/lib/api-auth'
import { apiHandler } from '@/lib/api-errors'
import { getMemberUsage, checkOrganizationRole } from '@/lib/billing/organization'
import { toMoneyNumber } from '@/lib/billing/money'

/**
 * GET /api/organizations/[id]/members/[userId]/usage
 * 获取成员消费记录
 * 查询参数: startDate?: string, endDate?: string
 * 权限: owner 或 admin
 */
export const GET = apiHandler(async (req, ctx) => {
  const params = await ctx.params
  const organizationId = params.id as string
  const targetUserId = params.userId as string

  // 验证用户认证
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  // 验证权限：仅 owner 或 admin 可查看成员消费记录
  const hasPermission = await checkOrganizationRole(organizationId, session.user.id, ['owner', 'admin'])
  if (!hasPermission) {
    return forbidden('只有组织所有者或管理员可以查看成员消费记录')
  }

  // 解析查询参数
  const { searchParams } = new URL(req.url)
  const startDateStr = searchParams.get('startDate')
  const endDateStr = searchParams.get('endDate')

  // 解析日期
  let startDate: Date | undefined
  let endDate: Date | undefined

  if (startDateStr) {
    const parsed = new Date(startDateStr)
    if (!isNaN(parsed.getTime())) {
      startDate = parsed
    }
  }

  if (endDateStr) {
    const parsed = new Date(endDateStr)
    if (!isNaN(parsed.getTime())) {
      endDate = parsed
    }
  }

  // 检查组织是否存在
  const organization = await withPrismaRetry(() =>
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true },
    })
  )

  if (!organization) {
    return notFound('Organization')
  }

  // 检查目标成员是否存在
  const member = await withPrismaRetry(() =>
    prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId,
          userId: targetUserId,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
      },
    })
  )

  if (!member) {
    return notFound('Member')
  }

  // 获取成员消费记录
  const usage = await getMemberUsage(organizationId, targetUserId, {
    startDate,
    endDate,
  })

  // 获取配额信息
  const quota = toMoneyNumber(member.quota || 0)

  // 计算配额使用情况
  let quotaUsage = null
  if (quota > 0) {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    const monthUsageResult = await prisma.organizationUsage.aggregate({
      where: {
        organizationId,
        userId: targetUserId,
        type: 'task',
        createdAt: { gte: startOfMonth },
      },
      _sum: {
        amount: true,
      },
    })

    const monthUsed = toMoneyNumber(monthUsageResult._sum.amount || 0)
    quotaUsage = {
      quota,
      used: monthUsed,
      remaining: Math.max(0, quota - monthUsed),
      period: 'month',
      periodStart: startOfMonth.toISOString(),
      periodEnd: now.toISOString(),
    }
  }

  // 按类型分组统计
  const typeStats = await prisma.organizationUsage.groupBy({
    by: ['type'],
    where: {
      organizationId,
      userId: targetUserId,
      type: 'task',
      ...(startDate ? { createdAt: { gte: startDate } } : {}),
      ...(endDate ? { createdAt: { lte: endDate } } : {}),
    },
    _sum: {
      amount: true,
    },
    _count: true,
  })

  const usageByType = typeStats.map((stat) => ({
    type: stat.type,
    totalAmount: Number(stat._sum.amount || 0),
    count: stat._count,
  }))

  // 按项目分组统计（如果有 projectId 相关字段可以利用）
  // 这里简化处理，暂时不关联项目

  return NextResponse.json({
    success: true,
    organizationId: organization.id,
    organizationName: organization.name,
    member: {
      id: member.id,
      userId: member.userId,
      userName: member.user.name,
      userEmail: member.user.email,
      userImage: member.user.image,
      role: member.role,
      status: member.status,
      joinedAt: member.joinedAt.toISOString(),
    },
    period: {
      startDate: startDate?.toISOString(),
      endDate: endDate?.toISOString(),
    },
    quota: quotaUsage,
    summary: {
      totalAmount: usage.totalAmount,
      totalCount: usage.totalCount,
    },
    usageByType,
    recentUsage: usage.usages.map((u) => ({
      id: u.id,
      amount: u.amount,
      type: u.type,
      description: u.description,
      createdAt: u.createdAt,
    })),
  })
})
