import { describe, expect, it } from 'vitest'
import { getSubscriptionEmptyState } from '@/lib/saas/subscription-page-state'

describe('subscription page empty state', () => {
  it.each([
    [{ organizationCount: 0, activePlanCount: 2, subscriptionCount: 0 }, 'no-organizations'],
    [{ organizationCount: 1, activePlanCount: 0, subscriptionCount: 0 }, 'no-active-plans'],
    [{ organizationCount: 1, activePlanCount: 2, subscriptionCount: 0 }, 'no-subscriptions'],
    [{ organizationCount: 1, activePlanCount: 2, subscriptionCount: 1 }, null],
  ] as const)('maps %o to %s', (input, expected) => {
    expect(getSubscriptionEmptyState(input)).toBe(expected)
  })
})
