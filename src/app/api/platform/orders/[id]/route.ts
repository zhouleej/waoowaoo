/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePlatformAdmin, createAdminAuditLog } from '@/lib/platform-admin'
import { apiHandler } from '@/lib/api-errors'
import { badRequest, notFound } from '@/lib/api-auth'
import { readString } from '@/lib/saas/validation'
import { serializeOrder } from '@/lib/saas/serializers'
import { applyPaidBillingOrder, refundPaidBillingOrder } from '@/lib/saas/billing-state'
import { assertBillingOrderTransition, parseBillingOrderStatus } from '@/lib/saas/billing-status'

export const GET = apiHandler<{ id: string }>(async (_req, { params }) => {
  const auth = await requirePlatformAdmin()
  if (auth instanceof NextResponse) return auth
  const { id } = await params
  const order = await prisma.billingOrder.findUnique({ where: { id }, include: { organization: true, plan: true, subscription: true, invoice: true } })
  if (!order) return notFound('BillingOrder')
  return NextResponse.json({ data: serializeOrder(order) })
})

export const PATCH = apiHandler<{ id: string }>(async (req, { params }) => {
  const auth = await requirePlatformAdmin()
  if (auth instanceof NextResponse) return auth
  const { user } = auth
  const { id } = await params
  const existing = await prisma.billingOrder.findUnique({ where: { id } })
  if (!existing) return notFound('BillingOrder')
  let body: any
  try { body = await req.json() } catch { return badRequest('请求体必须是JSON') }
  try {
    const status = body.status === undefined
      ? undefined
      : parseBillingOrderStatus(readString(body.status, '订单状态', { required: true, max: 32 }))
    if (status) assertBillingOrderTransition(existing.status, status)
    const externalOrderId = body.externalOrderId !== undefined ? readString(body.externalOrderId, '外部订单号', { max: 128 }) || null : undefined
    const metadata = body.metadata !== undefined && typeof body.metadata === 'object' ? body.metadata : undefined
    const order = status === 'paid'
      ? await applyPaidBillingOrder(id, { externalOrderId, metadata })
      : status === 'refunded'
        ? await refundPaidBillingOrder(id)
        : await prisma.billingOrder.update({
        where: { id },
        data: {
          ...(status ? { status } : {}),
          ...(externalOrderId !== undefined ? { externalOrderId } : {}),
          ...(metadata !== undefined ? { metadata } : {}),
        },
        include: { organization: true, plan: true, subscription: true, invoice: true },
      })
    if (!order) return notFound('BillingOrder')
    await createAdminAuditLog({ adminId: user.id, action: 'update_order', targetType: 'BillingOrder', targetId: id, details: { changed: Object.keys(body) } })
    return NextResponse.json({ data: serializeOrder(order) })
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : '订单参数无效')
  }
})
