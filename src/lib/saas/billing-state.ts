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

export async function applyPaidBillingOrder(orderId: string, update: PaidOrderUpdate = {}) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.billingOrder.findUnique({
      where: { id: orderId },
      include: { subscription: true, invoice: true },
    })
    if (!existing) return null

    const paidAt = existing.paidAt || update.paidAt || new Date()
    let subscriptionId = existing.subscriptionId
    let planId = existing.planId || existing.subscription?.planId || null

    if (!subscriptionId && planId) {
      const subscription = await tx.organizationSubscription.create({
        data: {
          organizationId: existing.organizationId,
          planId,
          status: 'active',
          currentPeriodStart: paidAt,
          autoRenew: false,
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
          currentPeriodStart: order.subscription?.currentPeriodStart || paidAt,
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
