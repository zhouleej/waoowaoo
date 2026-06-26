/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePlatformAdmin, createAdminAuditLog } from '@/lib/platform-admin'
import { badRequest, notFound } from '@/lib/api-auth'
import { readString } from '@/lib/saas/validation'
import { serializeOrder } from '@/lib/saas/serializers'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const auth = await requirePlatformAdmin()
  if (auth instanceof NextResponse) return auth
  const { id } = await params
  const order = await prisma.billingOrder.findUnique({ where: { id }, include: { organization: true, plan: true, subscription: true, invoice: true } })
  if (!order) return notFound('BillingOrder')
  return NextResponse.json({ data: serializeOrder(order) })
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const auth = await requirePlatformAdmin()
  if (auth instanceof NextResponse) return auth
  const { user } = auth
  const { id } = await params
  const existing = await prisma.billingOrder.findUnique({ where: { id } })
  if (!existing) return notFound('BillingOrder')
  let body: any
  try { body = await req.json() } catch { return badRequest('请求体必须是JSON') }
  try {
    const status = body.status === undefined ? undefined : readString(body.status, '订单状态', { required: true, max: 32 })
    const order = await prisma.billingOrder.update({
      where: { id },
      data: {
        ...(status ? { status, paidAt: status === 'paid' && !existing.paidAt ? new Date() : existing.paidAt } : {}),
        ...(body.externalOrderId !== undefined ? { externalOrderId: readString(body.externalOrderId, '外部订单号', { max: 128 }) || null } : {}),
        ...(body.metadata !== undefined && typeof body.metadata === 'object' ? { metadata: body.metadata } : {}),
      },
      include: { organization: true, plan: true, subscription: true, invoice: true },
    })
    await createAdminAuditLog({ adminId: user.id, action: 'update_order', targetType: 'BillingOrder', targetId: id, details: { changed: Object.keys(body) } })
    return NextResponse.json({ data: serializeOrder(order) })
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : '订单参数无效')
  }
}
