/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import { apiHandler } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import { requirePlatformAdmin, createAdminAuditLog } from '@/lib/platform-admin'
import { badRequest, notFound } from '@/lib/api-auth'
import { nextOrderNo, parsePagination, readNumber, readString } from '@/lib/saas/validation'
import { serializeInvoice } from '@/lib/saas/serializers'

export const GET = apiHandler(async (req: NextRequest) => {
  const auth = await requirePlatformAdmin()
  if (auth instanceof NextResponse) return auth
  const { searchParams } = new URL(req.url)
  const { page, limit, skip } = parsePagination(searchParams)
  const where: any = {}
  const organizationId = searchParams.get('organizationId')?.trim()
  const status = searchParams.get('status')?.trim()
  if (organizationId) where.organizationId = organizationId
  if (status) where.status = status
  const [data, total] = await Promise.all([
    prisma.billingInvoice.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' }, include: { organization: true, order: true } }),
    prisma.billingInvoice.count({ where }),
  ])
  return NextResponse.json({ data: data.map(serializeInvoice), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } })
})

export const POST = apiHandler(async (req: NextRequest) => {
  const auth = await requirePlatformAdmin()
  if (auth instanceof NextResponse) return auth
  const { user } = auth
  let body: any
  try { body = await req.json() } catch { return badRequest('请求体必须是JSON') }
  try {
    const orderId = readString(body.orderId, '订单ID', { required: true })!
    const order = await prisma.billingOrder.findUnique({ where: { id: orderId } })
    if (!order) return notFound('BillingOrder')
    const invoice = await prisma.billingInvoice.create({
      data: {
        invoiceNo: readString(body.invoiceNo, '发票号', { max: 64 }) || nextOrderNo('INV'),
        organizationId: order.organizationId,
        orderId,
        title: readString(body.title, '发票抬头', { required: true, max: 160 })!,
        taxNo: readString(body.taxNo, '税号', { max: 64 }),
        amount: readNumber(body.amount ?? order.amount, '金额', { min: 0 })!,
        status: readString(body.status ?? 'pending', '发票状态', { max: 32 })!,
        issuedAt: body.issuedAt ? new Date(body.issuedAt) : null,
        metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : undefined,
      },
      include: { organization: true, order: true },
    })
    await createAdminAuditLog({ adminId: user.id, action: 'create_invoice', targetType: 'BillingInvoice', targetId: invoice.id, details: { orderId, invoiceNo: invoice.invoiceNo } })
    return NextResponse.json({ data: serializeInvoice(invoice) }, { status: 201 })
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : '发票参数无效')
  }
})
