export const BILLING_ORDER_STATUSES = ['pending', 'paid', 'canceled', 'refunded', 'failed'] as const
export type BillingOrderStatus = typeof BILLING_ORDER_STATUSES[number]

export const BILLING_ORDER_TYPES = ['subscription', 'renewal', 'upgrade', 'recharge', 'adjustment'] as const
export type BillingOrderType = typeof BILLING_ORDER_TYPES[number]

export const SUBSCRIPTION_STATUSES = ['trialing', 'active', 'past_due', 'canceled', 'expired'] as const
export type SubscriptionStatus = typeof SUBSCRIPTION_STATUSES[number]

export const INVOICE_STATUSES = ['pending', 'issued', 'voided'] as const
export type InvoiceStatus = typeof INVOICE_STATUSES[number]

export const ORGANIZATION_BUSINESS_STATUSES = ['trial', 'paid', 'overdue', 'churned'] as const
export type OrganizationBusinessStatus = typeof ORGANIZATION_BUSINESS_STATUSES[number]

const ORDER_TRANSITIONS: Record<BillingOrderStatus, ReadonlySet<BillingOrderStatus>> = {
  pending: new Set(['pending', 'paid', 'canceled', 'failed']),
  paid: new Set(['paid', 'refunded']),
  canceled: new Set(['canceled']),
  refunded: new Set(['refunded']),
  failed: new Set(['failed', 'pending']),
}

function parseEnumValue<T extends readonly string[]>(value: unknown, field: string, allowed: T): T[number] {
  if (typeof value !== 'string') throw new Error(`${field}格式不正确`)
  const normalized = value.trim()
  if (!allowed.includes(normalized)) {
    throw new Error(`${field}必须是 ${allowed.join(', ')} 之一`)
  }
  return normalized as T[number]
}

export function parseBillingOrderStatus(value: unknown, field = '订单状态'): BillingOrderStatus {
  return parseEnumValue(value, field, BILLING_ORDER_STATUSES)
}

export function parseBillingOrderType(value: unknown, field = '订单类型'): BillingOrderType {
  return parseEnumValue(value, field, BILLING_ORDER_TYPES)
}

export function parseSubscriptionStatus(value: unknown, field = '订阅状态'): SubscriptionStatus {
  return parseEnumValue(value, field, SUBSCRIPTION_STATUSES)
}

export function parseInvoiceStatus(value: unknown, field = '发票状态'): InvoiceStatus {
  return parseEnumValue(value, field, INVOICE_STATUSES)
}

export function assertBillingOrderTransition(current: string, next: BillingOrderStatus) {
  const normalizedCurrent = parseBillingOrderStatus(current, '当前订单状态')
  if (!ORDER_TRANSITIONS[normalizedCurrent].has(next)) {
    throw new Error(`订单状态不能从 ${normalizedCurrent} 变更为 ${next}`)
  }
}

export function businessStatusForSubscriptionStatus(status: string): OrganizationBusinessStatus {
  const normalized = parseSubscriptionStatus(status)
  if (normalized === 'trialing') return 'trial'
  if (normalized === 'active') return 'paid'
  if (normalized === 'past_due') return 'overdue'
  return 'churned'
}

export function isCurrentSubscriptionStatus(status: string) {
  const normalized = parseSubscriptionStatus(status)
  return normalized === 'trialing' || normalized === 'active' || normalized === 'past_due'
}
