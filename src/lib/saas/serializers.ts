/* eslint-disable @typescript-eslint/no-explicit-any */
type DecimalLike = { toString(): string } | number | string | null | undefined

export function money(value: DecimalLike) {
  if (value === null || value === undefined) return 0
  return Number(value.toString())
}

export function serializePlan(plan: any) {
  return {
    ...plan,
    price: money(plan.price),
  }
}

export function serializeOrder(order: any) {
  return {
    ...order,
    amount: money(order.amount),
  }
}

export function serializeInvoice(invoice: any) {
  return {
    ...invoice,
    amount: money(invoice.amount),
  }
}

export function serializeSubscription(subscription: any) {
  return {
    ...subscription,
    plan: subscription.plan ? serializePlan(subscription.plan) : subscription.plan,
    orders: Array.isArray(subscription.orders) ? subscription.orders.map(serializeOrder) : subscription.orders,
  }
}

export function serializeOrganization(org: any) {
  return {
    ...org,
    balance: org.balance ? {
      ...org.balance,
      balance: money(org.balance.balance),
      frozenAmount: money(org.balance.frozenAmount),
      totalSpent: money(org.balance.totalSpent),
    } : null,
  }
}
