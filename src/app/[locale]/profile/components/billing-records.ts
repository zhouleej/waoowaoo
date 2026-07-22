export type BillingFilter = 'all' | 'consume' | 'recharge'

export interface BillingDetailLabels {
  image: (count: string) => string
  imageWithRes: (count: string, resolution: string) => string
  video: (count: string) => string
  videoWithRes: (count: string, resolution: string) => string
  tokens: (count: string) => string
  seconds: (count: string) => string
  calls: (count: string) => string
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function finiteNumber(value: unknown): number | null {
  const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN
  return Number.isFinite(number) && number >= 0 ? number : null
}

function safeText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text && text !== '[object Object]' ? text : null
}

function formatCount(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value)
}

export interface BillingTokenUsage {
  input: number | null
  output: number | null
  total: number
}

export function getBillingTokenUsage(billingMeta: unknown): BillingTokenUsage | null {
  const root = asRecord(billingMeta)
  if (!root) return null
  const nested = asRecord(root.metadata)
  const read = (key: string) => root[key] ?? nested?.[key]
  const input = finiteNumber(read('actualInputTokens') ?? read('inputTokens'))
  const output = finiteNumber(read('actualOutputTokens') ?? read('outputTokens'))
  const quantity = finiteNumber(read('quantity'))
  const unit = safeText(read('unit'))?.toLowerCase()
  const total = input !== null || output !== null
    ? (input ?? 0) + (output ?? 0)
    : unit === 'token' || unit === 'tokens' ? quantity : null
  return total === null ? null : { input, output, total }
}

export function formatTokenCount(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value)
}

export function formatBillingDetail(
  billingMeta: unknown,
  labels: BillingDetailLabels,
  locale: string,
): string[] {
  const root = asRecord(billingMeta)
  if (!root) return []

  // reporting/ledger currently writes these fields at the root. Keep a nested fallback for legacy rows.
  const nested = asRecord(root.metadata)
  const read = (key: string) => root[key] ?? nested?.[key]
  const unit = safeText(read('unit'))?.toLowerCase()
  const quantity = finiteNumber(read('quantity'))
  const resolution = safeText(read('resolution'))
  const duration = finiteNumber(read('duration'))
  const tokenUsage = getBillingTokenUsage(billingMeta)

  const details: string[] = []
  const count = quantity === null ? null : formatCount(quantity, locale)

  if ((unit === 'image' || unit === 'images') && count) {
    details.push(resolution ? labels.imageWithRes(count, resolution) : labels.image(count))
  } else if (unit === 'video' || unit === 'videos') {
    const videoCount = count ?? '1'
    details.push(resolution ? labels.videoWithRes(videoCount, resolution) : labels.video(videoCount))
    if (duration !== null) details.push(labels.seconds(formatCount(duration, locale)))
  } else if ((unit === 'second' || unit === 'seconds') && count) {
    details.push(labels.seconds(count))
  } else if ((unit === 'call' || unit === 'calls') && count) {
    details.push(labels.calls(count))
  }

  if (tokenUsage !== null) details.push(labels.tokens(formatTokenCount(tokenUsage.total, locale)))
  return [...new Set(details)]
}

export function changeBillingFilter(filter: BillingFilter): { filter: BillingFilter; page: number } {
  return { filter, page: 1 }
}

export function moveBillingPage(page: number, direction: 'previous' | 'next', totalPages: number): number {
  const delta = direction === 'previous' ? -1 : 1
  return Math.min(Math.max(page + delta, 1), Math.max(totalPages, 1))
}
