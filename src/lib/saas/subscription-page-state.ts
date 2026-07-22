export type SubscriptionEmptyState = 'no-organizations' | 'no-active-plans' | 'no-subscriptions' | null

export function getSubscriptionEmptyState(input: {
  organizationCount: number
  activePlanCount: number
  subscriptionCount: number
}): SubscriptionEmptyState {
  if (input.organizationCount === 0) return 'no-organizations'
  if (input.activePlanCount === 0) return 'no-active-plans'
  if (input.subscriptionCount === 0) return 'no-subscriptions'
  return null
}
