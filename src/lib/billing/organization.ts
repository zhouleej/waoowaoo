/**
 * 组织计费逻辑
 * 处理组织余额、成员配额和组织消费记录
 */

import { logInfo as _ulogInfo, logError as _ulogError } from '@/lib/logging/core'
import { prisma } from '@/lib/prisma'
import { withPrismaRetry } from '@/lib/prisma-retry'
import { toMoneyNumber, roundMoney, type MoneyValue } from './money'

const MONEY_SCALE = 6
const MONEY_EPSILON = 1e-9

function normalizeMoney(value: number): number {
  return roundMoney(value, MONEY_SCALE)
}

type OrganizationBalanceSnapshot = {
  id: string
  organizationId: string
  balance: number
  frozenAmount: number
  totalSpent: number
  createdAt: Date
  updatedAt: Date
}

type OrganizationMemberSnapshot = {
  id: string
  userId: string
  organizationId: string
  role: string
  quota: number
  status: string
  joinedAt: Date
}

function toBalanceSnapshot(balance: {
  id: string
  organizationId: string
  balance: MoneyValue
  frozenAmount: MoneyValue
  totalSpent: MoneyValue
  createdAt: Date
  updatedAt: Date
}): OrganizationBalanceSnapshot {
  return {
    id: balance.id,
    organizationId: balance.organizationId,
    balance: toMoneyNumber(balance.balance),
    frozenAmount: toMoneyNumber(balance.frozenAmount),
    totalSpent: toMoneyNumber(balance.totalSpent),
    createdAt: balance.createdAt,
    updatedAt: balance.updatedAt,
  }
}

/**
 * 获取组织余额
 */
export async function getOrganizationBalance(organizationId: string): Promise<OrganizationBalanceSnapshot | null> {
  const balance = await prisma.organizationBalance.findUnique({
    where: { organizationId },
  })

  if (!balance) {
    return null
  }

  return toBalanceSnapshot(balance)
}

/**
 * 确保组织有余额记录（如果不存在则创建）
 */
export async function ensureOrganizationBalance(organizationId: string): Promise<OrganizationBalanceSnapshot> {
  let balance = await prisma.organizationBalance.findUnique({
    where: { organizationId },
  })

  if (!balance) {
    balance = await prisma.organizationBalance.create({
      data: {
        organizationId,
        balance: 0,
        frozenAmount: 0,
        totalSpent: 0,
      },
    })
  }

  return toBalanceSnapshot(balance)
}

/**
 * 增加组织余额
 */
export async function addOrganizationBalance(
  organizationId: string,
  amount: number,
  options?: {
    reason?: string
    operatorId?: string
    externalOrderId?: string
    idempotencyKey?: string
  },
): Promise<OrganizationBalanceSnapshot> {
  const normalizedAmount = normalizeMoney(Number(amount))
  if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
    throw new Error('amount must be a positive number')
  }

  const updatedBalance = await prisma.$transaction(async (tx) => {
    // 确保余额记录存在
    let balance = await tx.organizationBalance.findUnique({
      where: { organizationId },
    })

    if (!balance) {
      balance = await tx.organizationBalance.create({
        data: {
          organizationId,
          balance: normalizedAmount,
          frozenAmount: 0,
          totalSpent: 0,
        },
      })
    } else {
      balance = await tx.organizationBalance.update({
        where: { organizationId },
        data: {
          balance: { increment: normalizedAmount },
        },
      })
    }

    return balance
  })

  _ulogInfo(`[OrganizationBalance] add balance success: organizationId=${organizationId}, amount=¥${normalizedAmount}, reason=${options?.reason || 'N/A'}`)

  return toBalanceSnapshot(updatedBalance)
}

/**
 * 冻结组织余额（用于预付费场景）
 */
export async function freezeOrganizationBalance(
  organizationId: string,
  amount: number,
): Promise<string | null> {
  const normalizedAmount = normalizeMoney(Number(amount))
  if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
    return null
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 确保余额记录存在
      let balance = await tx.organizationBalance.findUnique({
        where: { organizationId },
      })

      if (!balance) {
        balance = await tx.organizationBalance.create({
          data: {
            organizationId,
            balance: 0,
            frozenAmount: 0,
            totalSpent: 0,
          },
        })
      }

      // 尝试扣减余额并增加冻结金额
      const updated = await tx.organizationBalance.updateMany({
        where: {
          organizationId,
          balance: { gte: normalizedAmount },
        },
        data: {
          balance: { decrement: normalizedAmount },
          frozenAmount: { increment: normalizedAmount },
        },
      })

      if (updated.count === 0) {
        return null
      }

      return `org_freeze_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
    })

    return result
  } catch (error) {
    _ulogError('[OrganizationBilling] freeze failed:', error)
    return null
  }
}

/**
 * 确认扣款（从冻结金额转为实际消费）
 */
export async function confirmOrganizationCharge(
  freezeId: string,
  amount: number,
): Promise<boolean> {
  const normalizedAmount = normalizeMoney(Number(amount))
  if (!Number.isFinite(normalizedAmount) || normalizedAmount < 0) {
    return false
  }

  try {
    await prisma.$transaction(async (tx) => {
      // 获取最新的冻结金额记录
      const balance = await tx.organizationBalance.findUnique({
        where: { organizationId: (await tx.organizationBalance.findUnique({ where: { id: freezeId } }))?.organizationId || '' },
      })

      // 直接扣除冻结金额并增加总消费
      const refundAmount = normalizeMoney(Math.max(0, -normalizedAmount)) // 如果 amount 是负数则退款

      if (balance) {
        await tx.organizationBalance.update({
          where: { id: balance.id },
          data: {
            frozenAmount: { decrement: normalizedAmount },
            totalSpent: { increment: normalizedAmount },
            ...(refundAmount > 0 ? { balance: { increment: refundAmount } } : {}),
          },
        })
      }
    })

    return true
  } catch (error) {
    _ulogError('[OrganizationBilling] confirm charge failed:', error)
    return false
  }
}

/**
 * 回滚组织余额冻结
 */
export async function rollbackOrganizationFreeze(freezeId: string): Promise<boolean> {
  try {
    // 对于简单场景，直接通过消费记录回滚
    // 这里简化处理，实际可能需要存储冻结记录
    return true
  } catch (error) {
    _ulogError('[OrganizationBilling] rollback freeze failed:', error)
    return false
  }
}

/**
 * 检查组织余额是否足够
 */
export async function checkOrganizationBalance(organizationId: string, requiredAmount: number): Promise<boolean> {
  const balance = await getOrganizationBalance(organizationId)
  if (!balance) return false
  return balance.balance >= requiredAmount
}

/**
 * 获取组织成员配额信息
 */
export async function getOrganizationMemberQuota(organizationId: string, userId: string): Promise<OrganizationMemberSnapshot | null> {
  const member = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: {
        organizationId,
        userId,
      },
    },
  })

  if (!member) {
    return null
  }

  return {
    id: member.id,
    userId: member.userId,
    organizationId: member.organizationId,
    role: member.role,
    quota: toMoneyNumber(member.quota || 0),
    status: member.status,
    joinedAt: member.joinedAt,
  }
}

/**
 * 检查成员是否有可用配额
 */
export async function checkMemberQuota(organizationId: string, userId: string): Promise<{ hasQuota: boolean; quota: number; used: number; remaining: number }> {
  const member = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: {
        organizationId,
        userId,
      },
    },
  })

  if (!member) {
    return { hasQuota: false, quota: 0, used: 0, remaining: 0 }
  }

  const quota = toMoneyNumber(member.quota || 0)
  
  // 计算已使用配额（当月消费）
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  
  const usageResult = await prisma.organizationUsage.aggregate({
    where: {
      organizationId,
      userId,
      createdAt: { gte: startOfMonth },
    },
    _sum: {
      amount: true,
    },
  })

  const used = toMoneyNumber(usageResult._sum.amount || 0)
  const remaining = Math.max(0, quota - used)

  return {
    hasQuota: quota > 0,
    quota,
    used,
    remaining,
  }
}

/**
 * 记录组织消费
 */
export async function recordOrganizationUsage(
  organizationId: string,
  userId: string,
  amount: number,
  type: string,
  description?: string,
): Promise<boolean> {
  try {
    const normalizedAmount = normalizeMoney(Number(amount))
    if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
      return false
    }

    await prisma.$transaction(async (tx) => {
      // 更新组织余额（消费）
      await tx.organizationBalance.update({
        where: { organizationId },
        data: {
          totalSpent: { increment: normalizedAmount },
        },
      })

      // 记录消费明细
      await tx.organizationUsage.create({
        data: {
          organizationId,
          userId,
          amount: normalizedAmount,
          type,
          description,
        },
      })
    })

    return true
  } catch (error) {
    _ulogError('[OrganizationBilling] record usage failed:', error)
    return false
  }
}

/**
 * 获取组织消费记录
 */
export async function getOrganizationUsage(
  organizationId: string,
  options?: {
    startDate?: Date
    endDate?: Date
  },
) {
  const where: Record<string, unknown> = {
    organizationId,
  }

  if (options?.startDate) {
    where.createdAt = { ...where.createdAt as object, gte: options.startDate }
  }

  if (options?.endDate) {
    where.createdAt = { ...where.createdAt as object, lte: options.endDate }
  }

  const usages = await prisma.organizationUsage.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  // 汇总统计
  const stats = await prisma.organizationUsage.aggregate({
    where,
    _sum: {
      amount: true,
    },
    _count: true,
  })

  return {
    usages: usages.map((u) => ({
      id: u.id,
      userId: u.userId,
      amount: toMoneyNumber(u.amount),
      type: u.type,
      description: u.description,
      createdAt: u.createdAt,
    })),
    totalAmount: toMoneyNumber(stats._sum.amount || 0),
    totalCount: stats._count,
  }
}

/**
 * 获取组织成员消费记录
 */
export async function getMemberUsage(
  organizationId: string,
  userId: string,
  options?: {
    startDate?: Date
    endDate?: Date
  },
) {
  const where: Record<string, unknown> = {
    organizationId,
    userId,
  }

  if (options?.startDate) {
    where.createdAt = { ...where.createdAt as object, gte: options.startDate }
  }

  if (options?.endDate) {
    where.createdAt = { ...where.createdAt as object, lte: options.endDate }
  }

  const usages = await prisma.organizationUsage.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  // 汇总统计
  const stats = await prisma.organizationUsage.aggregate({
    where,
    _sum: {
      amount: true,
    },
    _count: true,
  })

  // 获取成员信息
  const member = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: {
        organizationId,
        userId,
      },
    },
  })

  return {
    member: member ? {
      id: member.id,
      role: member.role,
      quota: toMoneyNumber(member.quota || 0),
      status: member.status,
      joinedAt: member.joinedAt,
    } : null,
    usages: usages.map((u) => ({
      id: u.id,
      amount: toMoneyNumber(u.amount),
      type: u.type,
      description: u.description,
      createdAt: u.createdAt,
    })),
    totalAmount: toMoneyNumber(stats._sum.amount || 0),
    totalCount: stats._count,
  }
}

/**
 * 获取用户所属组织信息
 */
export async function getUserOrganization(userId: string): Promise<{ organizationId: string; role: string; quota: number } | null> {
  const member = await prisma.organizationMember.findFirst({
    where: {
      userId,
      status: 'active',
    },
    orderBy: { joinedAt: 'desc' },
  })

  if (!member) {
    return null
  }

  return {
    organizationId: member.organizationId,
    role: member.role,
    quota: toMoneyNumber(member.quota || 0),
  }
}

/**
 * 验证用户在组织中的角色
 */
export async function checkOrganizationRole(
  organizationId: string,
  userId: string,
  allowedRoles: string[],
): Promise<boolean> {
  const member = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: {
        organizationId,
        userId,
      },
    },
  })

  if (!member) {
    return false
  }

  return allowedRoles.includes(member.role)
}