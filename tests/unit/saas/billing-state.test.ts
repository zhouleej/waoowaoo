import { beforeEach, describe, expect, it, vi } from 'vitest'

const prismaMock = vi.hoisted(() => ({
  billingOrder: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  organizationSubscription: {
    create: vi.fn(),
    update: vi.fn(),
  },
  organization: {
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  billingInvoice: {
    updateMany: vi.fn(),
  },
  $transaction: vi.fn((callback) => callback(prismaMock)),
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

const organizationBillingMock = vi.hoisted(() => ({
  addOrganizationBalanceInTransaction: vi.fn(),
}))

vi.mock('@/lib/billing/organization', () => organizationBillingMock)

describe('saas billing state transitions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.organizationSubscription.update.mockImplementation(async (input) => ({
      id: input.where.id,
      organizationId: 'org-1',
      planId: input.data.planId || 'plan-1',
      status: input.data.status || 'active',
    }))
  })

  it('activates a subscription and invoice exactly when an order becomes paid', async () => {
    const { applyPaidBillingOrder } = await import('@/lib/saas/billing-state')
    const paidAt = new Date('2026-06-28T00:00:00Z')

    prismaMock.billingOrder.findUnique.mockResolvedValue({
      id: 'order-1',
      organizationId: 'org-1',
      subscriptionId: null,
      planId: 'plan-1',
      status: 'pending',
      paidAt: null,
      subscription: null,
      invoice: { id: 'invoice-1', issuedAt: null },
    })
    prismaMock.organizationSubscription.create.mockResolvedValue({
      id: 'sub-1',
      planId: 'plan-1',
      currentPeriodStart: paidAt,
    })
    prismaMock.billingOrder.update.mockResolvedValue({
      id: 'order-1',
      organizationId: 'org-1',
      subscriptionId: 'sub-1',
      planId: 'plan-1',
      status: 'paid',
      paidAt,
      subscription: { id: 'sub-1', planId: 'plan-1', currentPeriodStart: paidAt },
      invoice: { id: 'invoice-1', issuedAt: null },
    })

    const order = await applyPaidBillingOrder('order-1', { paidAt })

    expect(order?.status).toBe('paid')
    expect(prismaMock.organizationSubscription.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        organizationId: 'org-1',
        planId: 'plan-1',
        status: 'active',
      }),
    }))
    expect(prismaMock.organization.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'org-1' },
      data: expect.objectContaining({
        currentPlanId: 'plan-1',
        currentSubscriptionId: 'sub-1',
        businessStatus: 'paid',
      }),
    }))
    expect(prismaMock.billingInvoice.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { orderId: 'order-1', status: { not: 'issued' } },
      data: expect.objectContaining({ status: 'issued' }),
    }))
  })

  it('does not create another subscription when a paid order is applied again', async () => {
    const { applyPaidBillingOrder } = await import('@/lib/saas/billing-state')
    const paidAt = new Date('2026-06-28T00:00:00Z')

    prismaMock.billingOrder.findUnique.mockResolvedValue({
      id: 'order-1',
      organizationId: 'org-1',
      subscriptionId: 'sub-1',
      planId: 'plan-1',
      status: 'paid',
      paidAt,
      subscription: { id: 'sub-1', planId: 'plan-1', currentPeriodStart: paidAt },
      invoice: { id: 'invoice-1', issuedAt: paidAt },
    })
    prismaMock.billingOrder.update.mockResolvedValue({
      id: 'order-1',
      organizationId: 'org-1',
      subscriptionId: 'sub-1',
      planId: 'plan-1',
      status: 'paid',
      paidAt,
      subscription: { id: 'sub-1', planId: 'plan-1', currentPeriodStart: paidAt },
      invoice: { id: 'invoice-1', issuedAt: paidAt },
    })

    await applyPaidBillingOrder('order-1')

    expect(prismaMock.organizationSubscription.create).not.toHaveBeenCalled()
    expect(prismaMock.organization.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ currentSubscriptionId: 'sub-1' }),
    }))
  })

  it('applies a paid recharge order to organization balance with order idempotency', async () => {
    const { applyPaidBillingOrder } = await import('@/lib/saas/billing-state')
    const paidAt = new Date('2026-06-28T00:00:00Z')

    prismaMock.billingOrder.findUnique.mockResolvedValue({
      id: 'order-recharge-1',
      organizationId: 'org-1',
      subscriptionId: null,
      planId: null,
      type: 'recharge',
      amount: 300,
      status: 'pending',
      paidAt: null,
      externalOrderId: 'pay-1',
      subscription: null,
      invoice: null,
    })
    prismaMock.billingOrder.update.mockResolvedValue({
      id: 'order-recharge-1',
      organizationId: 'org-1',
      subscriptionId: null,
      planId: null,
      type: 'recharge',
      amount: 300,
      status: 'paid',
      paidAt,
      externalOrderId: 'pay-1',
      subscription: null,
      invoice: null,
    })

    await applyPaidBillingOrder('order-recharge-1', { paidAt })

    expect(organizationBillingMock.addOrganizationBalanceInTransaction).toHaveBeenCalledWith(
      prismaMock,
      'org-1',
      300,
      expect.objectContaining({
        reason: '订单充值',
        externalOrderId: 'pay-1',
        idempotencyKey: 'billing-order:order-recharge-1:recharge',
      }),
    )
    expect(prismaMock.organizationSubscription.create).not.toHaveBeenCalled()
    expect(prismaMock.organization.update).not.toHaveBeenCalled()
  })

  it('maps subscription states back to organization business status', async () => {
    const { syncOrganizationSubscriptionState } = await import('@/lib/saas/billing-state')

    await syncOrganizationSubscriptionState(prismaMock, {
      id: 'sub-1',
      organizationId: 'org-1',
      planId: 'plan-1',
      status: 'past_due',
    })

    expect(prismaMock.organization.update).toHaveBeenCalledWith({
      where: { id: 'org-1' },
      data: {
        currentPlanId: 'plan-1',
        currentSubscriptionId: 'sub-1',
        businessStatus: 'overdue',
      },
    })

    await syncOrganizationSubscriptionState(prismaMock, {
      id: 'sub-1',
      organizationId: 'org-1',
      planId: 'plan-1',
      status: 'canceled',
    })

    expect(prismaMock.organization.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'org-1',
        currentSubscriptionId: 'sub-1',
      },
      data: {
        currentPlanId: null,
        currentSubscriptionId: null,
        businessStatus: 'churned',
      },
    })
  })
})
