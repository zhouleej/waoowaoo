export function readString(value: unknown, field: string, options?: { required?: boolean; max?: number; pattern?: RegExp }) {
  if (value === undefined || value === null || value === '') {
    if (options?.required) throw new Error(`${field}不能为空`)
    return undefined
  }
  if (typeof value !== 'string') throw new Error(`${field}格式不正确`)
  const trimmed = value.trim()
  if (options?.required && !trimmed) throw new Error(`${field}不能为空`)
  if (options?.max && trimmed.length > options.max) throw new Error(`${field}长度不能超过${options.max}`)
  if (options?.pattern && !options.pattern.test(trimmed)) throw new Error(`${field}格式不正确`)
  return trimmed
}

export function readNumber(value: unknown, field: string, options?: { required?: boolean; min?: number; max?: number; integer?: boolean }) {
  if (value === undefined || value === null || value === '') {
    if (options?.required) throw new Error(`${field}不能为空`)
    return undefined
  }
  const n = Number(value)
  if (!Number.isFinite(n)) throw new Error(`${field}必须是数字`)
  if (options?.integer && !Number.isInteger(n)) throw new Error(`${field}必须是整数`)
  if (options?.min !== undefined && n < options.min) throw new Error(`${field}不能小于${options.min}`)
  if (options?.max !== undefined && n > options.max) throw new Error(`${field}不能大于${options.max}`)
  return n
}

export function readBoolean(value: unknown, field: string, options?: { required?: boolean }) {
  if (value === undefined || value === null || value === '') {
    if (options?.required) throw new Error(`${field}不能为空`)
    return undefined
  }
  if (typeof value !== 'boolean') throw new Error(`${field}必须是布尔值`)
  return value
}

export function readJsonObject(value: unknown, field: string) {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error(`${field}必须是对象`)
  return value as Record<string, unknown>
}

export function parsePagination(searchParams: URLSearchParams) {
  const page = Math.max(1, Number.parseInt(searchParams.get('page') || '1', 10) || 1)
  const rawLimit = Number.parseInt(searchParams.get('limit') || '20', 10) || 20
  const limit = Math.min(100, Math.max(1, rawLimit))
  return { page, limit, skip: (page - 1) * limit }
}

export function nextOrderNo(prefix: string) {
  return `${prefix}${Date.now()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`
}
