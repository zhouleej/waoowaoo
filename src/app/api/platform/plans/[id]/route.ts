/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import { apiHandler } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import { requirePlatformAdmin, createAdminAuditLog } from '@/lib/platform-admin'
import { badRequest, notFound } from '@/lib/api-auth'
import { readJsonObject, readNumber, readString } from '@/lib/saas/validation'
import { serializePlan } from '@/lib/saas/serializers'
import type { Prisma } from '@prisma/client'

type Ctx = { params: Promise<{ id: string }> }

export const GET = apiHandler(async (_req: NextRequest, { params }: Ctx) => {
  const auth = await requirePlatformAdmin()
  if (auth instanceof NextResponse) return auth
  const { id } = await params
  const plan = await prisma.pricingPlan.findUnique({ where: { id }, include: { entitlements: true, _count: { select: { subscriptions: true } } } })
  if (!plan) return notFound('PricingPlan')
  return NextResponse.json({ data: serializePlan(plan) })
})

export const PATCH = apiHandler(async (req: NextRequest, { params }: Ctx) => {
  const auth = await requirePlatformAdmin()
  if (auth instanceof NextResponse) return auth
  const { user } = auth
  const { id } = await params
  const existing = await prisma.pricingPlan.findUnique({ where: { id }, include: { _count: { select: { subscriptions: true } } } })
  if (!existing) return notFound('PricingPlan')
  let body: any
  try { body = await req.json() } catch { return badRequest('请求体必须是JSON') }
  try {
    if (existing._count.subscriptions > 0 && (body.code !== undefined || body.billingCycle !== undefined || body.price !== undefined)) {
      return badRequest('套餐已被订阅，禁止修改编码、价格和计费周期')
    }
    const entitlements = body.entitlements === undefined ? undefined : readJsonObject(body.entitlements, '套餐权益')
    const plan = await prisma.$transaction(async (tx) => {
      await tx.pricingPlan.update({
        where: { id },
        data: {
          ...(body.name !== undefined ? { name: readString(body.name, '套餐名称', { required: true, max: 80 }) } : {}),
          ...(body.description !== undefined ? { description: readString(body.description, '描述', { max: 1000 }) || null } : {}),
          ...(body.status !== undefined ? { status: readString(body.status, '状态', { required: true, max: 32 }) } : {}),
          ...(body.sortOrder !== undefined ? { sortOrder: readNumber(body.sortOrder, '排序', { integer: true }) } : {}),
          ...(body.isPublic !== undefined ? { isPublic: Boolean(body.isPublic) } : {}),
          ...(body.metadata !== undefined ? { metadata: readJsonObject(body.metadata, '扩展信息') as Prisma.InputJsonValue } : {}),
        },
      })
      if (entitlements) {
        await tx.planEntitlement.deleteMany({ where: { planId: id } })
        for (const [key, value] of Object.entries(entitlements)) await tx.planEntitlement.create({ data: { planId: id, key, value: value as any } })
      }
      return tx.pricingPlan.findUniqueOrThrow({ where: { id }, include: { entitlements: true } })
    })
    await createAdminAuditLog({ adminId: user.id, action: 'update_plan', targetType: 'PricingPlan', targetId: id, details: { changed: Object.keys(body) } })
    return NextResponse.json({ data: serializePlan(plan) })
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : '套餐参数无效')
  }
})

export const DELETE = apiHandler(async (_req: NextRequest, { params }: Ctx) => {
  const auth = await requirePlatformAdmin()
  if (auth instanceof NextResponse) return auth
  const { user } = auth
  const { id } = await params
  const plan = await prisma.pricingPlan.findUnique({ where: { id }, include: { _count: { select: { subscriptions: true } } } })
  if (!plan) return notFound('PricingPlan')
  if (plan._count.subscriptions > 0) {
    await prisma.pricingPlan.update({ where: { id }, data: { status: 'archived', isPublic: false } })
  } else {
    await prisma.pricingPlan.delete({ where: { id } })
  }
  await createAdminAuditLog({ adminId: user.id, action: 'delete_plan', targetType: 'PricingPlan', targetId: id, details: { softDelete: plan._count.subscriptions > 0 } })
  return NextResponse.json({ success: true })
})
