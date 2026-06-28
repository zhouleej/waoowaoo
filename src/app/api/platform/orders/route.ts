/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePlatformAdmin, createAdminAuditLog } from '@/lib/platform-admin'
import { apiHandler } from '@/lib/api-errors'
import { badRequest, notFound } from '@/lib/api-auth'
import { nextOrderNo, parsePagination, readNumber, readString } from '@/lib/saas/validation'
import { serializeOrder } from '@/lib/saas/serializers'

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
    const order = await prisma.billingOrder.create({
      data: {
        orderNo: readString(body.orderNo, '订单号', { max: 64 }) || nextOrderNo('SO'),
        organizationId,
        subscriptionId: readString(body.subscriptionId, '订阅ID'),
        planId: readString(body.planId, '套餐ID'),
        type: readString(body.type ?? 'subscription', '订单类型', { max: 32 })!,
        status: readString(body.status ?? 'pending', '订单状态', { max: 32 })!,
        amount: readNumber(body.amount, '金额', { required: true, min: 0 })!,
        currency: readString(body.currency ?? 'CNY', '币种', { max: 8 })!,
        paidAt: body.paidAt ? new Date(body.paidAt) : null,
        externalOrderId: readString(body.externalOrderId, '外部订单号', { max: 128 }),
        metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : undefined,
      },
      include: { organization: true, plan: true, subscription: true },
    })
    await createAdminAuditLog({ adminId: user.id, action: 'create_order', targetType: 'BillingOrder', targetId: order.id, details: { organizationId, orderNo: order.orderNo } })
    return NextResponse.json({ data: serializeOrder(order) }, { status: 201 })
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : '订单参数无效')
  }
})
