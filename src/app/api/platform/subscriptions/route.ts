/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import { apiHandler } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import { requirePlatformAdmin, createAdminAuditLog } from '@/lib/platform-admin'
import { badRequest, notFound } from '@/lib/api-auth'
import { parsePagination, readNumber, readString } from '@/lib/saas/validation'
import { serializeSubscription } from '@/lib/saas/serializers'

export const GET = apiHandler(async (req: NextRequest) => {
  const auth = await requirePlatformAdmin()
  if (auth instanceof NextResponse) return auth
  try {
    const { searchParams } = new URL(req.url)
    const { page, limit, skip } = parsePagination(searchParams)
    const where: any = {}
    const organizationId = searchParams.get('organizationId')?.trim()
    const status = searchParams.get('status')?.trim()
    if (organizationId) where.organizationId = organizationId
    if (status) where.status = status
    const [data, total] = await Promise.all([
      prisma.organizationSubscription.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' }, include: { organization: true, plan: true, orders: { take: 5, orderBy: { createdAt: 'desc' } } } }),
      prisma.organizationSubscription.count({ where }),
    ])
    return NextResponse.json({ data: data.map(serializeSubscription), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } })
  } catch (error) {
    return NextResponse.json({ data: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 1 }, unavailable: true, error: error instanceof Error ? error.message : 'Subscriptions unavailable' })
  }
})

export const POST = apiHandler(async (req: NextRequest) => {
  const auth = await requirePlatformAdmin()
  if (auth instanceof NextResponse) return auth
  const { user } = auth
  let body: any
  try { body = await req.json() } catch { return badRequest('请求体必须是JSON') }
  try {
    const organizationId = readString(body.organizationId, '企业ID', { required: true })!
    const planId = readString(body.planId, '套餐ID', { required: true })!
    const [org, plan] = await Promise.all([
      prisma.organization.findUnique({ where: { id: organizationId } }),
      prisma.pricingPlan.findUnique({ where: { id: planId } }),
    ])
    if (!org) return notFound('Organization')
    if (!plan) return notFound('PricingPlan')
    if (plan.status !== 'active') return badRequest('套餐不可订阅')
    const sub = await prisma.$transaction(async (tx) => {
      await tx.organizationSubscription.updateMany({ where: { organizationId, status: { in: ['trialing', 'active', 'past_due'] } }, data: { status: 'canceled', canceledAt: new Date(), autoRenew: false } })
      const created = await tx.organizationSubscription.create({
        data: {
          organizationId, planId,
          status: readString(body.status ?? 'active', '订阅状态', { max: 32 }),
          currentPeriodStart: body.currentPeriodStart ? new Date(body.currentPeriodStart) : new Date(),
          currentPeriodEnd: body.currentPeriodEnd ? new Date(body.currentPeriodEnd) : null,
          autoRenew: Boolean(body.autoRenew),
          seats: readNumber(body.seats ?? 1, '席位数', { min: 1, integer: true }) || 1,
          metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : undefined,
        },
      })
      await tx.organization.update({ where: { id: organizationId }, data: { currentPlanId: planId, currentSubscriptionId: created.id, businessStatus: 'paid' } })
      return tx.organizationSubscription.findUniqueOrThrow({ where: { id: created.id }, include: { organization: true, plan: true } })
    })
    await createAdminAuditLog({ adminId: user.id, action: 'create_subscription', targetType: 'OrganizationSubscription', targetId: sub.id, details: { organizationId, planId } })
    return NextResponse.json({ data: serializeSubscription(sub) }, { status: 201 })
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : '订阅参数无效')
  }
})
