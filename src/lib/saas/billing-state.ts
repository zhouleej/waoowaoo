import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { addOrganizationBalanceInTransaction } from '@/lib/billing/organization'
import {
  businessStatusForSubscriptionStatus,
  isCurrentSubscriptionStatus,
} from '@/lib/saas/billing-status'

type PaidOrderUpdate = {
  paidAt?: Date
  externalOrderId?: string | null
  metadata?: Prisma.InputJsonValue
}

type OrganizationStateClient = {
  organization: {
    update(args: Prisma.OrganizationUpdateArgs): unknown
    updateMany(args: Prisma.OrganizationUpdateManyArgs): unknown
  }
}

type SubscriptionState = {
  id: string
  organizationId: string
  planId: string
  status: string
}

function toMoneyNumber(value: unknown) {
  if (value === null || value === undefined) return 0
  if (typeof value === 'number') return value
  if (typeof value === 'string') return Number(value)
  if (typeof value === 'object' && 'toString' in value && typeof value.toString === 'function') {
    return Number(value.toString())
  }
  return Number(value)
}

export function periodEndFor(start: Date, billingCycle: string) {
  if (!Number.isFinite(start.getTime())) throw new Error('账期开始时间无效')
  const year = start.getUTCFullYear()
  const month = start.getUTCMonth()
  const day = start.getUTCDate()
  const targetYear = billingCycle === 'yearly' ? year + 1 : year
  const targetMonth = billingCycle === 'monthly' ? month + 1 : month
  if (billingCycle !== 'monthly' && billingCycle !== 'yearly') {
    throw new Error(`不支持的订阅账期: ${billingCycle}`)
  }
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate()
  return new Date(Date.UTC(
    targetYear,
    targetMonth,
    Math.min(day, lastDay),
    start.getUTCHours(),
    start.getUTCMinutes(),
    start.getUTCSeconds(),
    start.getUTCMilliseconds(),
  ))
}

export function subscriptionPeriodFor(input: {
  currentPeriodStart?: unknown
  currentPeriodEnd?: unknown
  billingCycle: string
  status: string
  now?: Date
}) {
  const start = input.currentPeriodStart === undefined || input.currentPeriodStart === null || input.currentPeriodStart === ''
    ? new Date(input.now ?? Date.now())
    : new Date(String(input.currentPeriodStart))
  if (!Number.isFinite(start.getTime())) throw new Error('账期开始时间无效')

  const end = input.currentPeriodEnd === undefined || input.currentPeriodEnd === null || input.currentPeriodEnd === ''
    ? periodEndFor(start, input.billingCycle)
    : new Date(String(input.currentPeriodEnd))
  if (!Number.isFinite(end.getTime())) throw new Error('账期结束时间无效')
  if (end.getTime() <= start.getTime()) throw new Error('账期结束时间必须晚于开始时间')
  if (['active', 'trialing'].includes(input.status) && !Number.isFinite(end.getTime())) {
    throw new Error('生效中的订阅必须设置有效账期')
  }
  return { start, end }
}

function laterDate(left: Date | null | undefined, right: Date) {
  return left && left.getTime() > right.getTime() ? left : right
}

export async function syncOrganizationSubscriptionState(
  tx: OrganizationStateClient,
  subscription: SubscriptionState,
) {
  const businessStatus = businessStatusForSubscriptionStatus(subscription.status)
  if (isCurrentSubscriptionStatus(subscription.status)) {
    await tx.organization.update({
      where: { id: subscription.organizationId },
      data: {
        currentPlanId: subscription.planId,
        currentSubscriptionId: subscription.id,
        businessStatus,
      },
    })
    return
  }

  await tx.organization.updateMany({
    where: {
      id: subscription.organizationId,
      currentSubscriptionId: subscription.id,
    },
    data: {
      currentPlanId: null,
      currentSubscriptionId: null,
      businessStatus,
    },
  })
}

export async function refundPaidBillingOrder(orderId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM billing_orders WHERE id = ${orderId} FOR UPDATE`
    const order = await tx.billingOrder.findUnique({
      where: { id: orderId },
      include: { invoice: true, subscription: true },
    })
    if (!order) return null
    if (order.status === 'refunded') return order
    if (order.status !== 'paid') throw new Error('仅已支付订单可退款')
    if (order.invoice?.status === 'issued') throw new Error('发票已开具，请先红冲或作废发票')

    const claimed = await tx.billingOrder.updateMany({
      where: { id: orderId, status: 'paid' },
      data: { status: 'refunded' },
    })
    if (claimed.count === 0) return tx.billingOrder.findUnique({ where: { id: orderId } })

    if (order.type === 'recharge') {
      const amount = order.amount
      const debited = await tx.organizationBalance.updateMany({
        where: { organizationId: order.organizationId, balance: { gte: amount } },
        data: { balance: { decrement: amount } },
      })
      if (debited.count === 0) throw new Error('组织可用余额不足，无法冲正充值订单')
      await tx.organizationUsage.create({
        data: {
          organizationId: order.organizationId,
          userId: 'system',
          amount,
          balanceAmount: amount,
          type: 'refund_reversal',
          orderId: order.id,
          idempotencyKey: `billing-order:${order.id}:refund`,
          description: '充值订单全额退款冲正',
          metadata: { immutable: true, originalOrderId: order.id },
        },
      })
    } else if (order.subscriptionId) {
      const currentOrganization = await tx.organization.findUnique({
        where: { id: order.organizationId },
        select: { currentSubscriptionId: true },
      })
      const laterPaidOrder = await tx.billingOrder.findFirst({
        where: {
          organizationId: order.organizationId,
          status: 'paid',
          type: { in: ['subscription', 'renewal', 'upgrade'] },
          id: { not: order.id },
          OR: [
            { paidAt: { gt: order.paidAt || order.createdAt } },
            { paidAt: order.paidAt || order.createdAt, createdAt: { gt: order.createdAt } },
          ],
        },
        select: { id: true },
      })
      if (currentOrganization?.currentSubscriptionId !== order.subscriptionId || laterPaidOrder) {
        throw new Error('该订单已不是当前有效账期或存在后续已支付续费，禁止自动退款，请人工处理')
      }
      const subscription = await tx.organizationSubscription.update({
        where: { id: order.subscriptionId },
        data: { status: 'canceled', canceledAt: new Date(), autoRenew: false },
      })
      await syncOrganizationSubscriptionState(tx, subscription)
      await tx.organizationUsage.create({
        data: {
          organizationId: order.organizationId,
          userId: 'system',
          amount: order.amount,
          type: 'refund_reversal',
          orderId: order.id,
          idempotencyKey: `billing-order:${order.id}:refund`,
          description: '订阅订单全额退款权益撤销',
          metadata: { immutable: true, originalOrderId: order.id, subscriptionId: order.subscriptionId },
        },
      })
    }
    return tx.billingOrder.findUnique({ where: { id: orderId }, include: { organization: true, plan: true, subscription: true, invoice: true } })
  })
}

export async function applyPaidBillingOrder(orderId: string, update: PaidOrderUpdate = {}) {
  return prisma.$transaction(async (tx) => {
    // Keep the lock order consistent for payments: billing order first, then subscription.
    await tx.$queryRaw`SELECT id FROM billing_orders WHERE id = ${orderId} FOR UPDATE`
    const existing = await tx.billingOrder.findUnique({
      where: { id: orderId },
      include: {
        organization: true,
        subscription: { select: { id: true, planId: true } },
        plan: true,
        invoice: true,
      },
    })
    if (!existing) return null
    if (existing.status === 'paid') {
      return tx.billingOrder.findUnique({
        where: { id: orderId },
        include: { organization: true, subscription: { include: { plan: true } }, plan: true, invoice: true },
      })
    }
    if (existing.status !== 'pending' && existing.status !== 'failed') {
      throw new Error(`订单状态 ${existing.status} 不允许支付`)
    }

    const paidAt = existing.paidAt || update.paidAt || new Date()
    let subscriptionId = existing.subscriptionId
    let planId = existing.planId || existing.subscription?.planId || null
    let billingCycle = existing.plan?.billingCycle
    let renewalBase = paidAt

    if (subscriptionId) {
      await tx.$queryRaw`SELECT id FROM organization_subscriptions WHERE id = ${subscriptionId} FOR UPDATE`
      const lockedSubscription = await tx.organizationSubscription.findUnique({
        where: { id: subscriptionId },
        include: { plan: true },
      })
      if (!lockedSubscription) throw new Error('订单关联的订阅不存在')

      planId = existing.planId || lockedSubscription.planId
      billingCycle = billingCycle || lockedSubscription.plan.billingCycle
      renewalBase = laterDate(lockedSubscription.currentPeriodEnd, paidAt)
    }

    const periodEnd = billingCycle ? periodEndFor(renewalBase, billingCycle) : null

    if (!subscriptionId && planId) {
      const subscription = await tx.organizationSubscription.create({
        data: {
          organizationId: existing.organizationId,
          planId,
          status: 'active',
          currentPeriodStart: paidAt,
          currentPeriodEnd: periodEnd,
          seats: 1,
          metadata: {
            activatedByOrderId: existing.id,
          },
        },
      })
      subscriptionId = subscription.id
    }

    const order = await tx.billingOrder.update({
      where: { id: orderId },
      data: {
        status: 'paid',
        paidAt,
        ...(subscriptionId && subscriptionId !== existing.subscriptionId ? { subscriptionId } : {}),
        ...(update.externalOrderId !== undefined ? { externalOrderId: update.externalOrderId } : {}),
        ...(update.metadata !== undefined ? { metadata: update.metadata } : {}),
      },
      include: { organization: true, plan: true, subscription: true, invoice: true },
    })

    planId = order.planId || order.subscription?.planId || planId
    if (subscriptionId && planId) {
      const subscription = await tx.organizationSubscription.update({
        where: { id: subscriptionId },
        data: {
          status: 'active',
          planId,
          currentPeriodStart: paidAt,
          currentPeriodEnd: periodEnd,
        },
      })
      await syncOrganizationSubscriptionState(tx, subscription)
    }

    if (order.type === 'recharge') {
      await addOrganizationBalanceInTransaction(tx, order.organizationId, toMoneyNumber(order.amount), {
        reason: '订单充值',
        externalOrderId: order.externalOrderId || order.id,
        idempotencyKey: `billing-order:${order.id}:recharge`,
      })
    }

    if (order.invoice) {
      await tx.billingInvoice.updateMany({
        where: {
          orderId: order.id,
          status: { not: 'issued' },
        },
        data: {
          status: 'issued',
          issuedAt: order.invoice.issuedAt || paidAt,
        },
      })
    }

    return order
  })
}
