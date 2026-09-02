/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePlatformAdmin, createAdminAuditLog } from '@/lib/platform-admin'
import { apiHandler } from '@/lib/api-errors'
import { badRequest } from '@/lib/api-auth'
import { nextOrderNo, parsePagination, readBoolean, readJsonObject, readNumber, readString } from '@/lib/saas/validation'
import { serializePlan } from '@/lib/saas/serializers'
import type { Prisma } from '@prisma/client'

export const GET = apiHandler(async (req) => {
  const auth = await requirePlatformAdmin()
  if (auth instanceof NextResponse) return auth
  const { searchParams } = new URL(req.url)
  const { page, limit, skip } = parsePagination(searchParams)
  const search = searchParams.get('search')?.trim()
  const status = searchParams.get('status')?.trim()
  const where: any = {}
  if (search) where.OR = [{ name: { contains: search } }, { code: { contains: search } }]
  if (status) where.status = status
  const [plans, total] = await Promise.all([
    prisma.pricingPlan.findMany({ where, skip, take: limit, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }], include: { entitlements: true, _count: { select: { subscriptions: true } } } }),
    prisma.pricingPlan.count({ where }),
  ])
  return NextResponse.json({ data: plans.map(serializePlan), pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } })
})

export const POST = apiHandler(async (req) => {
  const auth = await requirePlatformAdmin()
  if (auth instanceof NextResponse) return auth
  const { user } = auth
  let body: any
  try { body = await req.json() } catch { return badRequest('请求体必须是JSON') }
  try {
    const code = readString(body.code, '套餐编码', { required: true, max: 64, pattern: /^[a-zA-Z0-9_-]+$/ })!
    const name = readString(body.name, '套餐名称', { required: true, max: 80 })!
    const price = readNumber(body.price ?? 0, '价格', { min: 0 })!
    const billingCycle = readString(body.billingCycle ?? 'monthly', '计费周期', { max: 32 })!
    const entitlements = readJsonObject(body.entitlements ?? {}, '套餐权益') || {}
    const plan = await prisma.$transaction(async (tx) => {
      const created = await tx.pricingPlan.create({
        data: {
          code, name, price, billingCycle,
          description: readString(body.description, '描述', { max: 1000 }),
          status: readString(body.status ?? 'active', '状态', { max: 32 }),
          currency: readString(body.currency ?? 'CNY', '币种', { max: 8 }),
          sortOrder: readNumber(body.sortOrder ?? 0, '排序', { integer: true }) || 0,
          isPublic: body.isPublic === undefined ? true : readBoolean(body.isPublic, '是否公开')!,
          metadata: readJsonObject(body.metadata, '扩展信息') as Prisma.InputJsonValue | undefined,
        },
      })
      for (const [key, value] of Object.entries(entitlements)) {
        await tx.planEntitlement.create({ data: { planId: created.id, key, value: value as any } })
      }
      return tx.pricingPlan.findUniqueOrThrow({ where: { id: created.id }, include: { entitlements: true } })
    })
    await createAdminAuditLog({ adminId: user.id, action: 'create_plan', targetType: 'PricingPlan', targetId: plan.id, details: { code, name, requestId: nextOrderNo('AUD') } })
    return NextResponse.json({ data: serializePlan(plan) }, { status: 201 })
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : '套餐参数无效')
  }
})
