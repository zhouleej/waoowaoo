/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePlatformAdmin, createAdminAuditLog } from '@/lib/platform-admin'
import { apiHandler } from '@/lib/api-errors'
import { badRequest, notFound } from '@/lib/api-auth'
import { nextOrderNo, parsePagination, readNumber, readString } from '@/lib/saas/validation'
import { serializeOrder } from '@/lib/saas/serializers'
import { applyPaidBillingOrder } from '@/lib/saas/billing-state'
import { parseBillingOrderStatus, parseBillingOrderType } from '@/lib/saas/billing-status'

export const GET = apiHandler(async (req) => {
  const auth = await requirePlatformAdmin()
  if (auth instanceof NextResponse) return auth
  const { searchParams } = new URL(req.url)
  const { page, limit, skip } = parsePagination(searchParams)
  const where: any = {}
  for (const key of ['organizationId', 'status', 'type']) {
    const value = searchParams.get(key)?.trim()
    if (value) where[key] = value
  }
  const [data, total] = await Promise.all([
    prisma.billingOrder.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' }, include: { organization: true, plan: true, subscription: true, invoice: true } }),
    prisma.billingOrder.count({ where }),
  ])
  return NextResponse.json({ data: data.map(serializeOrder), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } })
})

export const POST = apiHandler(async (req) => {
  const auth = await requirePlatformAdmin()
  if (auth instanceof NextResponse) return auth
  const { user } = auth
  let body: any
  try { body = await req.json() } catch { return badRequest('请求体必须是JSON') }
  try {
    const organizationId = readString(body.organizationId, '企业ID', { required: true })!
    const org = await prisma.organization.findUnique({ where: { id: organizationId } })
    if (!org) return notFound('Organization')
    const status = parseBillingOrderStatus(readString(body.status ?? 'pending', '订单状态', { max: 32 }) || 'pending')
    const type = parseBillingOrderType(readString(body.type ?? 'subscription', '订单类型', { max: 32 }) || 'subscription')
    const paidAt = body.paidAt ? new Date(body.paidAt) : undefined
    const externalOrderId = readString(body.externalOrderId, '外部订单号', { max: 128 })
    const subscriptionId = readString(body.subscriptionId, '订阅ID')
    const planId = readString(body.planId, '套餐ID')
    if (subscriptionId) {
      const subscription = await prisma.organizationSubscription.findUnique({ where: { id: subscriptionId } })
      if (!subscription || subscription.organizationId !== organizationId) throw new Error('订阅与企业不一致')
      if (planId && subscription.planId !== planId) throw new Error('订阅与套餐不一致')
    }
    if (planId) {
      const plan = await prisma.pricingPlan.findUnique({ where: { id: planId } })
      if (!plan || plan.status !== 'active') throw new Error('套餐不存在或不可用')
    }
    if (type !== 'recharge' && !planId && !subscriptionId) throw new Error('订阅类订单必须关联套餐或订阅')
    if (type === 'recharge' && (planId || subscriptionId)) throw new Error('充值订单不得关联套餐或订阅')
    const created = await prisma.billingOrder.create({
      data: {
        orderNo: readString(body.orderNo, '订单号', { max: 64 }) || nextOrderNo('SO'),
        organizationId,
        subscriptionId,
        planId,
        type,
        status: status === 'paid' ? 'pending' : status,
        amount: readNumber(body.amount, '金额', { required: true, min: 0 })!,
        currency: readString(body.currency ?? 'CNY', '币种', { max: 8 })!,
        paidAt: null,
        externalOrderId,
        metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : undefined,
      },
      include: { organization: true, plan: true, subscription: true },
    })
    const order = status === 'paid'
      ? await applyPaidBillingOrder(created.id, { paidAt, externalOrderId })
      : created
    if (!order) return notFound('BillingOrder')
    await createAdminAuditLog({ adminId: user.id, action: 'create_order', targetType: 'BillingOrder', targetId: order.id, details: { organizationId, orderNo: order.orderNo } })
    return NextResponse.json({ data: serializeOrder(order) }, { status: 201 })
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : '订单参数无效')
  }
})
