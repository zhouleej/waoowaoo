import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'

type PaidOrderUpdate = {
  paidAt?: Date
  externalOrderId?: string | null
  metadata?: Prisma.InputJsonValue
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
      await tx.organizationSubscription.update({
        where: { id: subscriptionId },
        data: {
          status: 'active',
          planId,
          currentPeriodStart: order.subscription?.currentPeriodStart || paidAt,
        },
      })
      await tx.organization.update({
        where: { id: order.organizationId },
        data: {
          currentPlanId: planId,
          currentSubscriptionId: subscriptionId,
          businessStatus: 'paid',
        },
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
