import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePlatformAdmin } from '@/lib/platform-admin'

/**
 * GET /api/platform/stats
 * 获取平台统计数据
 * 返回：
 *   - totalOrganizations
 *   - totalUsers
 *   - totalBalance
 *   - totalUsage
 *   - organizationStats（各组织消费排行）
 *   - userStats（活跃用户排行）
 */
export async function GET(req: NextRequest) {
  const authResult = await requirePlatformAdmin()
  if (authResult instanceof NextResponse) return authResult

  // 获取组织统计
  const [totalOrganizations, disabledOrganizations] = await Promise.all([
    prisma.organization.count(),
    prisma.organization.count({ where: { status: 'disabled' } }),
  ])

  // 获取用户统计
  const [totalUsers, globalLockedUsers] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { isGlobalLocked: true } }),
  ])

  // 获取余额统计（用户余额）
  const userBalances = await prisma.userBalance.findMany({
    select: {
      balance: true,
      totalSpent: true,
    },
  })

  const totalUserBalance = userBalances.reduce(
    (sum, b) => sum + Number(b.balance),
    0
  )
  const totalUserSpent = userBalances.reduce(
    (sum, b) => sum + Number(b.totalSpent),
    0
  )

  // 获取组织余额统计
  const orgBalances = await prisma.organizationBalance.findMany({
    select: {
      balance: true,
      totalSpent: true,
    },
  })

  const totalOrgBalance = orgBalances.reduce(
    (sum, b) => sum + Number(b.balance),
    0
  )
  const totalOrgSpent = orgBalances.reduce(
    (sum, b) => sum + Number(b.totalSpent),
    0
  )

  const totalBalance = totalUserBalance + totalOrgBalance
  const totalUsage = totalUserSpent + totalOrgSpent

  // 获取组织消费排行（按总消费）
  const organizationStats = await prisma.organizationBalance.findMany({
    orderBy: { totalSpent: 'desc' },
    take: 10,
    include: {
      organization: {
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
        },
      },
    },
  })

  const orgStats = organizationStats.map((ob) => ({
    id: ob.organization.id,
    name: ob.organization.name,
    slug: ob.organization.slug,
    status: ob.organization.status,
    balance: Number(ob.balance),
    totalSpent: Number(ob.totalSpent),
  }))

  // 获取活跃用户排行（按消费）
  const userStatsRaw = await prisma.userBalance.findMany({
    orderBy: { totalSpent: 'desc' },
    take: 10,
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  })

  const userStats = userStatsRaw.map((ub) => ({
    id: ub.user.id,
    name: ub.user.name,
    email: ub.user.email,
    balance: Number(ub.balance),
    totalSpent: Number(ub.totalSpent),
  }))

  // 额外统计：近7天新增用户
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  const [newUsersLast7Days, newOrgsLast7Days] = await Promise.all([
    prisma.user.count({
      where: {
        createdAt: { gte: sevenDaysAgo },
      },
    }),
    prisma.organization.count({
      where: {
        createdAt: { gte: sevenDaysAgo },
      },
    }),
  ])

  // 活跃任务数
  const activeTasks = await prisma.task.count({
    where: {
      status: { in: ['queued', 'processing'] },
    },
  })

  return NextResponse.json({
    totalOrganizations,
    activeOrganizations: totalOrganizations - disabledOrganizations,
    disabledOrganizations,
    totalUsers,
    globalLockedUsers,
    newUsersLast7Days,
    newOrgsLast7Days,
    totalBalance,
    totalUserBalance,
    totalOrgBalance,
    totalUsage,
    totalUserSpent,
    totalOrgSpent,
    activeTasks,
    organizationStats: orgStats,
    userStats,
  })
}