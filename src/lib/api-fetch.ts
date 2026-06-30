const LOCALE_PATH_PATTERN = /^\/(zh|en)(\/|$)/

function resolveLocaleFromPath(pathname: string): string {
  const match = pathname.match(LOCALE_PATH_PATTERN)
  return match?.[1] ?? 'zh'
}

export function getPageLocale(): string {
  if (typeof window === 'undefined') return 'zh'
  return resolveLocaleFromPath(window.location.pathname)
}

function resolveRequestPathname(input: RequestInfo | URL): string {
  if (typeof input === 'string') {
    if (input.startsWith('/')) return input
    try {
      return new URL(input).pathname
    } catch {
      return ''
    }
  }

  if (input instanceof URL) {
    return input.pathname
  }

  try {
    return new URL(input.url).pathname
  } catch {
    return ''
  }
}

function shouldInjectLocaleHeader(input: RequestInfo | URL): boolean {
  const pathname = resolveRequestPathname(input)
  return pathname === '/api' || pathname.startsWith('/api/')
}

export function mergeLocaleHeader(init?: RequestInit): RequestInit {
  const headers = new Headers(init?.headers)
  if (!headers.has('Accept-Language')) {
    headers.set('Accept-Language', getPageLocale())
  }
  return { ...init, headers }
}

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (!shouldInjectLocaleHeader(input)) {
    return fetch(input, init)
  }
  return fetch(input, mergeLocaleHeader(init))
}

function readApiErrorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>
    if (typeof record.error === 'string') return record.error
    if (record.error && typeof record.error === 'object') {
      const errorRecord = record.error as Record<string, unknown>
      if (typeof errorRecord.message === 'string') return errorRecord.message
    }
    if (typeof record.message === 'string') return record.message
  }
  return fallback
}

export async function apiJson<T = unknown>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await apiFetch(input, init)
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(readApiErrorMessage(payload, response.statusText || 'Request failed'))
  }
  return payload as T
}

export async function throwIfNotOk(response: Response, fallback = 'Request failed'): Promise<void> {
  if (response.ok) return
  const payload = await response.json().catch(() => null)
  throw new Error(readApiErrorMessage(payload, response.statusText || fallback))
}

export async function apiVoid(input: RequestInfo | URL, init?: RequestInit): Promise<void> {
  const response = await apiFetch(input, init)
  await throwIfNotOk(response)
}
