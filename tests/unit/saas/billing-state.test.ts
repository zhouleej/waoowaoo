import { beforeEach, describe, expect, it, vi } from 'vitest'

const prismaMock = vi.hoisted(() => ({
  billingOrder: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  organizationSubscription: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  organization: {
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  organizationBalance: {
    updateMany: vi.fn(),
  },
  organizationUsage: {
    create: vi.fn(),
  },
  billingInvoice: {
    updateMany: vi.fn(),
  },
  $queryRaw: vi.fn(),
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
    expect(prismaMock.billingOrder.update).not.toHaveBeenCalled()
    expect(prismaMock.organization.update).not.toHaveBeenCalled()
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

  it('clamps UTC subscription periods and preserves remaining time on early renewal', async () => {
    const { periodEndFor, applyPaidBillingOrder } = await import('@/lib/saas/billing-state')
    expect(periodEndFor(new Date('2025-01-31T10:20:30Z'), 'monthly').toISOString()).toBe('2025-02-28T10:20:30.000Z')
    expect(periodEndFor(new Date('2024-02-29T00:00:00Z'), 'yearly').toISOString()).toBe('2025-02-28T00:00:00.000Z')

    const paidAt = new Date('2026-01-15T00:00:00Z')
    const currentPeriodEnd = new Date('2026-01-31T00:00:00Z')
    prismaMock.billingOrder.findUnique.mockResolvedValue({
      id: 'renewal-1', organizationId: 'org-1', subscriptionId: 'sub-1', planId: 'plan-1',
      type: 'renewal', status: 'pending', paidAt: null, organization: {}, invoice: null,
      plan: { billingCycle: 'monthly' },
      subscription: { id: 'sub-1', planId: 'plan-1', currentPeriodEnd, plan: { billingCycle: 'monthly' } },
    })
    prismaMock.organizationSubscription.findUnique.mockResolvedValue({
      id: 'sub-1',
      organizationId: 'org-1',
      planId: 'plan-1',
      currentPeriodEnd,
      plan: { billingCycle: 'monthly' },
    })
    prismaMock.billingOrder.update.mockResolvedValue({
      id: 'renewal-1', organizationId: 'org-1', subscriptionId: 'sub-1', planId: 'plan-1',
      type: 'renewal', status: 'paid', paidAt, invoice: null, subscription: { id: 'sub-1', planId: 'plan-1' },
    })
    await applyPaidBillingOrder('renewal-1', { paidAt })
    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(2)
    expect(prismaMock.organizationSubscription.findUnique).toHaveBeenCalledWith({
      where: { id: 'sub-1' },
      include: { plan: true },
    })
    expect(prismaMock.organizationSubscription.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ currentPeriodEnd: new Date('2026-02-28T00:00:00Z') }),
    }))
  })

  it('serializes different renewal orders on the subscription and accumulates both periods', async () => {
    const { applyPaidBillingOrder } = await import('@/lib/saas/billing-state')
    const paidAt = new Date('2026-01-15T00:00:00Z')
    let currentPeriodEnd = new Date('2026-01-31T00:00:00Z')

    prismaMock.billingOrder.findUnique.mockImplementation(async ({ where }) => ({
      id: where.id,
      organizationId: 'org-1',
      subscriptionId: 'sub-1',
      planId: 'plan-1',
      type: 'renewal',
      status: 'pending',
      paidAt: null,
      organization: {},
      invoice: null,
      plan: { billingCycle: 'monthly' },
      subscription: { id: 'sub-1', planId: 'plan-1' },
    }))
    prismaMock.organizationSubscription.findUnique.mockImplementation(async () => ({
      id: 'sub-1',
      organizationId: 'org-1',
      planId: 'plan-1',
      currentPeriodEnd,
      plan: { billingCycle: 'monthly' },
    }))
    prismaMock.billingOrder.update.mockImplementation(async ({ where }) => ({
      id: where.id,
      organizationId: 'org-1',
      subscriptionId: 'sub-1',
      planId: 'plan-1',
      type: 'renewal',
      status: 'paid',
      paidAt,
      invoice: null,
      subscription: { id: 'sub-1', planId: 'plan-1' },
    }))
    prismaMock.organizationSubscription.update.mockImplementation(async ({ where, data }) => {
      currentPeriodEnd = data.currentPeriodEnd
      return {
        id: where.id,
        organizationId: 'org-1',
        planId: data.planId,
        status: data.status,
      }
    })

    await applyPaidBillingOrder('renewal-1', { paidAt })
    await applyPaidBillingOrder('renewal-2', { paidAt })

    expect(currentPeriodEnd).toEqual(new Date('2026-03-28T00:00:00Z'))
    expect(prismaMock.organizationSubscription.findUnique).toHaveBeenCalledTimes(2)
    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(4)
    const subscriptionLockCalls = prismaMock.$queryRaw.mock.calls.filter(
      ([query]) => query.join('').includes('organization_subscriptions'),
    )
    expect(subscriptionLockCalls).toHaveLength(2)
    expect(subscriptionLockCalls.map(([, subscriptionId]) => subscriptionId)).toEqual(['sub-1', 'sub-1'])
  })

  it('returns an already paid order without replaying side effects', async () => {
    const { applyPaidBillingOrder } = await import('@/lib/saas/billing-state')
    prismaMock.billingOrder.findUnique.mockResolvedValue({
      id: 'order-paid', organizationId: 'org-1', status: 'paid', type: 'subscription',
      paidAt: new Date(), organization: {}, subscription: {}, plan: {}, invoice: null,
    })
    const result = await applyPaidBillingOrder('order-paid')
    expect(result?.id).toBe('order-paid')
    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1)
    expect(prismaMock.organizationSubscription.create).not.toHaveBeenCalled()
    expect(prismaMock.billingOrder.update).not.toHaveBeenCalled()
  })

  it('rejects refunding a historical subscription order after a paid renewal', async () => {
    const { refundPaidBillingOrder } = await import('@/lib/saas/billing-state')
    const paidAt = new Date('2026-01-01T00:00:00Z')
    prismaMock.billingOrder.findUnique.mockResolvedValue({
      id: 'old-order', organizationId: 'org-1', subscriptionId: 'sub-1', type: 'subscription',
      amount: 100, status: 'paid', paidAt, createdAt: paidAt, invoice: null, subscription: { id: 'sub-1' },
    })
    prismaMock.billingOrder.updateMany.mockResolvedValue({ count: 1 })
    prismaMock.organization.findUnique.mockResolvedValue({ currentSubscriptionId: 'sub-1' })
    prismaMock.billingOrder.findFirst.mockResolvedValue({ id: 'renewal-2' })
    await expect(refundPaidBillingOrder('old-order')).rejects.toThrow('存在后续已支付续费')
    expect(prismaMock.organizationSubscription.update).not.toHaveBeenCalled()
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
