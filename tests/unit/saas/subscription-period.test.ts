import { describe, expect, it } from 'vitest'
import { subscriptionPeriodFor } from '@/lib/saas/billing-state'

describe('manual subscription billing period', () => {
  it('clamps a monthly period at the end of February', () => {
    const period = subscriptionPeriodFor({
      currentPeriodStart: '2025-01-31T10:20:30.000Z',
      billingCycle: 'monthly',
      status: 'active',
    })
    expect(period.end.toISOString()).toBe('2025-02-28T10:20:30.000Z')
  })

  it('clamps a yearly period started on leap day', () => {
    const period = subscriptionPeriodFor({
      currentPeriodStart: '2024-02-29T00:00:00.000Z',
      billingCycle: 'yearly',
      status: 'trialing',
    })
    expect(period.end.toISOString()).toBe('2025-02-28T00:00:00.000Z')
  })

  it('rejects an explicit end that is not later than the start', () => {
    expect(() => subscriptionPeriodFor({
      currentPeriodStart: '2026-07-17T12:00:00.000Z',
      currentPeriodEnd: '2026-07-17T12:00:00.000Z',
      billingCycle: 'monthly',
      status: 'active',
    })).toThrow('账期结束时间必须晚于开始时间')
  })
})
