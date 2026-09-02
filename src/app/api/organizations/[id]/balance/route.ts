import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withPrismaRetry } from '@/lib/prisma-retry'
import { requireUserAuth, isErrorResponse, notFound } from '@/lib/api-auth'
import { apiHandler } from '@/lib/api-errors'
import { requireOrganizationRole } from '@/lib/saas/permissions'
import { BILLING_CURRENCY } from '@/lib/billing/currency'
import {
  getOrganizationBalance,
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

  const permission = await requireOrganizationRole(organizationId, session.user.id, ['owner', 'admin', 'member'])
  if (permission.error) return permission.error

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
export const POST = apiHandler(async () => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult

  return NextResponse.json({
    error: '组织余额仅可通过已支付充值订单入账，请先创建并完成支付订单',
    code: 'PAYMENT_ORDER_REQUIRED',
  }, { status: 403 })
})
