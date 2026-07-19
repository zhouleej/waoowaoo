/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePlatformAdmin, createAdminAuditLog } from '@/lib/platform-admin'
import { apiHandler } from '@/lib/api-errors'
import { badRequest, notFound } from '@/lib/api-auth'
import { parsePagination, readNumber, readString } from '@/lib/saas/validation'
import { serializeSubscription } from '@/lib/saas/serializers'
import { parseSubscriptionStatus } from '@/lib/saas/billing-status'
import { subscriptionPeriodFor, syncOrganizationSubscriptionState } from '@/lib/saas/billing-state'

export const GET = apiHandler(async (req) => {
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
    prisma.organizationSubscription.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' }, include: { organization: true, plan: true, orders: { take: 5, orderBy: { createdAt: 'desc' } } } }),
    prisma.organizationSubscription.count({ where }),
  ])
  return NextResponse.json({ data: data.map(serializeSubscription), pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } })
})

export const POST = apiHandler(async (req) => {
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
    const status = parseSubscriptionStatus(readString(body.status ?? 'active', '订阅状态', { max: 32 }) || 'active')
    const period = subscriptionPeriodFor({
      currentPeriodStart: body.currentPeriodStart,
      currentPeriodEnd: body.currentPeriodEnd,
      billingCycle: plan.billingCycle,
      status,
    })
    const sub = await prisma.$transaction(async (tx) => {
      await tx.organizationSubscription.updateMany({ where: { organizationId, status: { in: ['trialing', 'active', 'past_due'] } }, data: { status: 'canceled', canceledAt: new Date(), autoRenew: false } })
      const created = await tx.organizationSubscription.create({
        data: {
          organizationId, planId,
          status,
          currentPeriodStart: period.start,
          currentPeriodEnd: period.end,
          autoRenew: Boolean(body.autoRenew),
          seats: readNumber(body.seats ?? 1, '席位数', { min: 1, integer: true }) || 1,
          metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : undefined,
        },
      })
      await syncOrganizationSubscriptionState(tx, created)
      return tx.organizationSubscription.findUniqueOrThrow({ where: { id: created.id }, include: { organization: true, plan: true } })
    })
    await createAdminAuditLog({ adminId: user.id, action: 'create_subscription', targetType: 'OrganizationSubscription', targetId: sub.id, details: { organizationId, planId } })
    return NextResponse.json({ data: serializeSubscription(sub) }, { status: 201 })
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : '订阅参数无效')
  }
})
