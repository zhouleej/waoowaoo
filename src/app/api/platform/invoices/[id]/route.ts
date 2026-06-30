/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import { apiHandler } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import { requirePlatformAdmin, createAdminAuditLog } from '@/lib/platform-admin'
import { badRequest, notFound } from '@/lib/api-auth'
import { readString } from '@/lib/saas/validation'
import { serializeInvoice } from '@/lib/saas/serializers'

type Ctx = { params: Promise<{ id: string }> }

export const GET = apiHandler(async (_req: NextRequest, { params }: Ctx) => {
  const auth = await requirePlatformAdmin()
  if (auth instanceof NextResponse) return auth
  const { id } = await params
  const invoice = await prisma.billingInvoice.findUnique({ where: { id }, include: { organization: true, order: true } })
  if (!invoice) return notFound('BillingInvoice')
  return NextResponse.json({ data: serializeInvoice(invoice) })
})

export const PATCH = apiHandler(async (req: NextRequest, { params }: Ctx) => {
  const auth = await requirePlatformAdmin()
  if (auth instanceof NextResponse) return auth
  const { user } = auth
  const { id } = await params
  const existing = await prisma.billingInvoice.findUnique({ where: { id } })
  if (!existing) return notFound('BillingInvoice')
  let body: any
  try { body = await req.json() } catch { return badRequest('请求体必须是JSON') }
  try {
    const status = body.status === undefined ? undefined : readString(body.status, '发票状态', { required: true, max: 32 })
    const invoice = await prisma.billingInvoice.update({
      where: { id },
      data: {
        ...(body.title !== undefined ? { title: readString(body.title, '发票抬头', { required: true, max: 160 }) } : {}),
        ...(body.taxNo !== undefined ? { taxNo: readString(body.taxNo, '税号', { max: 64 }) || null } : {}),
        ...(status ? { status, issuedAt: status === 'issued' && !existing.issuedAt ? new Date() : existing.issuedAt } : {}),
        ...(body.metadata !== undefined && typeof body.metadata === 'object' ? { metadata: body.metadata } : {}),
      },
      include: { organization: true, order: true },
    })
    await createAdminAuditLog({ adminId: user.id, action: 'update_invoice', targetType: 'BillingInvoice', targetId: id, details: { changed: Object.keys(body) } })
    return NextResponse.json({ data: serializeInvoice(invoice) })
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : '发票参数无效')
  }
})
