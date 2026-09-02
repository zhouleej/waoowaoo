/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePlatformAdmin, createAdminAuditLog } from '@/lib/platform-admin'
import { apiHandler } from '@/lib/api-errors'
import { badRequest, notFound } from '@/lib/api-auth'
import { readBoolean, readNumber, readString } from '@/lib/saas/validation'
import { parseSubscriptionStatus } from '@/lib/saas/billing-status'
import { syncOrganizationSubscriptionState } from '@/lib/saas/billing-state'

export const GET = apiHandler<{ id: string }>(async (_req, { params }) => {
  const auth = await requirePlatformAdmin()
  if (auth instanceof NextResponse) return auth
  const { id } = await params
  const sub = await prisma.organizationSubscription.findUnique({ where: { id }, include: { organization: true, plan: { include: { entitlements: true } }, orders: { include: { invoice: true }, orderBy: { createdAt: 'desc' } } } })
  if (!sub) return notFound('OrganizationSubscription')
  return NextResponse.json({ data: sub })
})

export const PATCH = apiHandler<{ id: string }>(async (req, { params }) => {
  const auth = await requirePlatformAdmin()
  if (auth instanceof NextResponse) return auth
  const { user } = auth
  const { id } = await params
  const existing = await prisma.organizationSubscription.findUnique({ where: { id } })
  if (!existing) return notFound('OrganizationSubscription')
  let body: any
  try { body = await req.json() } catch { return badRequest('请求体必须是JSON') }
  try {
    const planId = body.planId ? readString(body.planId, '套餐ID', { required: true }) : undefined
    const status = body.status === undefined
      ? undefined
      : parseSubscriptionStatus(readString(body.status, '订阅状态', { required: true, max: 32 }))
    if (planId) {
      const plan = await prisma.pricingPlan.findUnique({ where: { id: planId } })
      if (!plan) return notFound('PricingPlan')
      if (plan.status !== 'active') return badRequest('套餐不可订阅')
    }
    const sub = await prisma.$transaction(async (tx) => {
      const updated = await tx.organizationSubscription.update({
        where: { id },
        data: {
          ...(planId ? { planId } : {}),
          ...(status ? { status } : {}),
          ...(body.currentPeriodEnd !== undefined ? { currentPeriodEnd: body.currentPeriodEnd ? new Date(body.currentPeriodEnd) : null } : {}),
          ...(body.autoRenew !== undefined ? { autoRenew: readBoolean(body.autoRenew, '自动续费') } : {}),
          ...(body.seats !== undefined ? { seats: readNumber(body.seats, '席位数', { min: 1, integer: true }) } : {}),
          ...(status === 'canceled' ? { canceledAt: new Date(), autoRenew: false } : {}),
        },
      })
      await syncOrganizationSubscriptionState(tx, updated)
      return tx.organizationSubscription.findUniqueOrThrow({ where: { id }, include: { organization: true, plan: true } })
    })
    await createAdminAuditLog({ adminId: user.id, action: 'update_subscription', targetType: 'OrganizationSubscription', targetId: id, details: { changed: Object.keys(body) } })
    return NextResponse.json({ data: sub })
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : '订阅参数无效')
  }
})
