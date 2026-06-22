import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withPrismaRetry } from '@/lib/prisma-retry'
import { requireUserAuth, isErrorResponse, forbidden, notFound } from '@/lib/api-auth'
import { apiHandler } from '@/lib/api-errors'
import {
  getOrganizationUsage,
  getOrganizationBalance,
} from '@/lib/billing/organization'

/**
 * GET /api/organizations/[id]/usage
 * 获取组织消费统计
 * 查询参数: startDate?: string, endDate?: string
 */
export const GET = apiHandler(async (req, ctx) => {
  const params = await ctx.params
  const organizationId = params.id as string

  // 验证用户认证
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

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

  // 检查用户是否为组织成员
  const isMember = await withPrismaRetry(() =>
    prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId,
          userId: session.user.id,
        },
      },
    })
  )

  if (!isMember) {
    return forbidden('您不是该组织成员')
  }

  // 获取消费记录
  const usage = await getOrganizationUsage(organizationId, {
    startDate,
    endDate,
  })

  // 获取当前余额
  const balance = await getOrganizationBalance(organizationId)

  // 获取按用户分组的消费统计
  const userStats = await prisma.organizationUsage.groupBy({
    by: ['userId'],
    where: {
      organizationId,
      ...(startDate ? { createdAt: { gte: startDate } } : {}),
      ...(endDate ? { createdAt: { lte: endDate } } : {}),
    },
    _sum: {
      amount: true,
    },
    _count: true,
  })

  // 获取用户信息
  const userIds = userStats.map((s) => s.userId)
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, email: true },
  })

  const userMap = new Map(users.map((u) => [u.id, u]))

  // 格式化用户统计
  const memberUsage = userStats.map((stat) => {
    const user = userMap.get(stat.userId)
    return {
      userId: stat.userId,
      userName: user?.name || 'Unknown',
      totalAmount: Number(stat._sum.amount || 0),
      count: stat._count,
    }
  })

  // 获取按类型分组的统计
  const typeStats = await prisma.organizationUsage.groupBy({
    by: ['type'],
    where: {
      organizationId,
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

  return NextResponse.json({
    success: true,
    organizationId: organization.id,
    organizationName: organization.name,
    period: {
      startDate: startDate?.toISOString(),
      endDate: endDate?.toISOString(),
    },
    summary: {
      totalAmount: usage.totalAmount,
      totalCount: usage.totalCount,
      balance: balance?.balance ?? 0,
      frozenAmount: balance?.frozenAmount ?? 0,
    },
    usageByType,
    memberUsage,
    recentUsage: usage.usages,
  })
})