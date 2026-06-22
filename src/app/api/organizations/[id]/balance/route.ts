import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withPrismaRetry } from '@/lib/prisma-retry'
import { requireUserAuth, isErrorResponse, forbidden, notFound, badRequest } from '@/lib/api-auth'
import { apiHandler } from '@/lib/api-errors'
import { BILLING_CURRENCY } from '@/lib/billing/currency'
import {
  getOrganizationBalance,
  addOrganizationBalance,
  checkOrganizationRole,
} from '@/lib/billing/organization'

/**
 * GET /api/organizations/[id]/balance
 * 获取组织余额
 */
export const GET = apiHandler(async (_req, ctx) => {
  const params = await ctx.params
  const organizationId = params.id as string

  // 验证用户认证
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

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

  // 获取余额
  const balance = await getOrganizationBalance(organizationId)

  return NextResponse.json({
    success: true,
    currency: BILLING_CURRENCY,
    organizationId: organization.id,
    organizationName: organization.name,
    balance: balance?.balance ?? 0,
    frozenAmount: balance?.frozenAmount ?? 0,
    totalSpent: balance?.totalSpent ?? 0,
  })
})

/**
 * POST /api/organizations/[id]/balance
 * 组织充值
 * 请求体: { amount: number, paymentMethod?: string }
 * 权限: owner 或 admin
 */
export const POST = apiHandler(async (req, ctx) => {
  const params = await ctx.params
  const organizationId = params.id as string

  // 验证用户认证
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  // 解析请求体
  const body = await req.json()
  const { amount, paymentMethod } = body

  // 验证参数
  if (typeof amount !== 'number' || amount <= 0) {
    return badRequest('充值金额必须为正数')
  }

  // 检查组织是否存在
  const organization = await withPrismaRetry(() =>
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true, ownerId: true },
    })
  )

  if (!organization) {
    return notFound('Organization')
  }

  // 检查权限：仅 owner 或 admin 可充值
  const hasPermission = await checkOrganizationRole(organizationId, session.user.id, ['owner', 'admin'])
  if (!hasPermission) {
    return forbidden('只有组织所有者或管理员可以进行充值')
  }

  // 执行充值
  const updatedBalance = await addOrganizationBalance(
    organizationId,
    amount,
    {
      reason: `组织余额充值 - ${paymentMethod || 'unknown payment method'}`,
      operatorId: session.user.id,
    }
  )

  // 记录充值交易（可选：也可以添加到组织交易表）
  await withPrismaRetry(() =>
    prisma.organizationBalance.update({
      where: { organizationId },
      data: {
        balance: { increment: amount },
      },
    })
  )

  return NextResponse.json({
    success: true,
    currency: BILLING_CURRENCY,
    organizationId: organization.id,
    organizationName: organization.name,
    balance: updatedBalance.balance,
    frozenAmount: updatedBalance.frozenAmount,
    totalSpent: updatedBalance.totalSpent,
    message: '充值成功',
  })
})