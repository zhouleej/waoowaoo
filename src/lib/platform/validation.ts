const POSITIVE_INTEGER = /^[1-9]\d*$/

export const ORGANIZATION_STATUSES = ['active', 'disabled', 'deleted'] as const
export const ORGANIZATION_BUSINESS_STATUSES = ['trial', 'paid', 'overdue', 'churned'] as const

type StringValues = readonly string[]

export function readPlatformPagination(searchParams: URLSearchParams, defaults: { limit: number }) {
  const rawPage = searchParams.get('page') ?? '1'
  const rawLimit = searchParams.get('limit') ?? String(defaults.limit)

  if (!POSITIVE_INTEGER.test(rawPage)) throw new Error('page must be a positive integer')
  if (!POSITIVE_INTEGER.test(rawLimit)) throw new Error('limit must be a positive integer')

  const page = Number(rawPage)
  const limit = Number(rawLimit)
  if (!Number.isSafeInteger(page) || !Number.isSafeInteger(limit)) {
    throw new Error('page and limit must be safe integers')
  }
  if (limit > 100) throw new Error('limit must not exceed 100')

  const skip = (page - 1) * limit
  if (!Number.isSafeInteger(skip)) throw new Error('page is too large')
  return { page, limit, skip }
}

export function readStrictBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${field} must be a boolean`)
  return value
}

export function readStringEnum<T extends StringValues>(value: unknown, field: string, allowedValues: T): T[number] {
  if (typeof value !== 'string' || !allowedValues.includes(value)) {
    throw new Error(`${field} is invalid`)
  }
  return value as T[number]
}

export function safeParseAuditDetails(value: string | null): unknown {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch {
    return { raw: value, parseError: true }
  }
}

const SENSITIVE_CONFIG_KEY = /(password|passwd|secret|token|api[_-]?key|private[_-]?key|credential)/i

export function isSensitiveConfigKey(key: string): boolean {
  return SENSITIVE_CONFIG_KEY.test(key)
}

export function maskConfigValue(value: string): string {
  if (!value) return ''
  return '\u2022'.repeat(Math.min(Math.max(value.length, 8), 24))
}
