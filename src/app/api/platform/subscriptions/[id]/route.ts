/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePlatformAdmin, createAdminAuditLog } from '@/lib/platform-admin'
import { badRequest, notFound } from '@/lib/api-auth'
import { readNumber, readString } from '@/lib/saas/validation'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const auth = await requirePlatformAdmin()
  if (auth instanceof NextResponse) return auth
  const { id } = await params
  const sub = await prisma.organizationSubscription.findUnique({ where: { id }, include: { organization: true, plan: { include: { entitlements: true } }, orders: { include: { invoice: true }, orderBy: { createdAt: 'desc' } } } })
  if (!sub) return notFound('OrganizationSubscription')
  return NextResponse.json({ data: sub })
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
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
          ...(body.status !== undefined ? { status: readString(body.status, '订阅状态', { required: true, max: 32 }) } : {}),
          ...(body.currentPeriodEnd !== undefined ? { currentPeriodEnd: body.currentPeriodEnd ? new Date(body.currentPeriodEnd) : null } : {}),
          ...(body.autoRenew !== undefined ? { autoRenew: Boolean(body.autoRenew) } : {}),
          ...(body.seats !== undefined ? { seats: readNumber(body.seats, '席位数', { min: 1, integer: true }) } : {}),
          ...(body.status === 'canceled' ? { canceledAt: new Date(), autoRenew: false } : {}),
        },
      })
      if (updated.status === 'active' || updated.status === 'trialing') {
        await tx.organization.update({ where: { id: updated.organizationId }, data: { currentPlanId: updated.planId, currentSubscriptionId: updated.id, businessStatus: updated.status === 'trialing' ? 'trial' : 'paid' } })
      }
      return tx.organizationSubscription.findUniqueOrThrow({ where: { id }, include: { organization: true, plan: true } })
    })
    await createAdminAuditLog({ adminId: user.id, action: 'update_subscription', targetType: 'OrganizationSubscription', targetId: id, details: { changed: Object.keys(body) } })
    return NextResponse.json({ data: sub })
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : '订阅参数无效')
  }
}
