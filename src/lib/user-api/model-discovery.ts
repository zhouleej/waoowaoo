import { createHash } from 'node:crypto'
import {
  resolveSafeOutboundUrl,
  safeOutboundFetch,
  SafeOutboundError,
  type OutboundLookup,
} from '@/lib/security/safe-outbound-http'

export type DiscoveredModelType = 'llm' | 'image' | 'video' | 'audio'
export type DiscoveryConfidence = 'high' | 'medium' | 'low'

export interface DiscoveredModel {
  id: string
  name?: string
  ownedBy?: string
  suggestedType: DiscoveredModelType
  confidence: DiscoveryConfidence
  reason?: string
}

export interface ModelDiscoveryResult {
  models: DiscoveredModel[]
  discoveredAt: string
  partial: boolean
  warnings: string[]
  cacheHit: boolean
}

interface FetchLikeResponse {
  ok: boolean
  status: number
  headers: { get(name: string): string | null }
  json(): Promise<unknown>
  text(): Promise<string>
}

type FetchLike = (url: string, init: RequestInit) => Promise<FetchLikeResponse>
type LookupLike = OutboundLookup

const MAX_PAGES = 8
const MAX_MODELS = 1000
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024
const REQUEST_TIMEOUT_MS = 10_000
const CACHE_TTL_MS = 60_000
const cache = new Map<string, { expiresAt: number; value: ModelDiscoveryResult }>()
const pending = new Map<string, Promise<ModelDiscoveryResult>>()

export class ModelDiscoveryError extends Error {
  constructor(
    public readonly code: 'INVALID_URL' | 'SSRF_BLOCKED' | 'UPSTREAM_AUTH' | 'UPSTREAM_HTTP' | 'UPSTREAM_RESPONSE' | 'NETWORK' | 'NO_MODELS',
    message: string,
    public readonly status?: number,
  ) {
    super(message)
    this.name = 'ModelDiscoveryError'
  }
}

export async function validateDiscoveryUrl(
  input: string | URL,
  options: { lookup?: LookupLike; production?: boolean } = {},
): Promise<URL> {
  try {
    return (await resolveSafeOutboundUrl(input, options)).url
  } catch (error) {
    if (error instanceof SafeOutboundError) {
      throw new ModelDiscoveryError(error.code, error.message)
    }
    throw error
  }
}

function endpointCandidates(baseUrl: string): URL[] {
  const base = new URL(baseUrl)
  const path = base.pathname.replace(/\/+$/, '')
  const candidates = new Set<string>()
  const add = (pathname: string) => {
    const url = new URL(base)
    url.pathname = pathname.replace(/\/+/g, '/')
    url.search = ''
    url.hash = ''
    candidates.add(url.toString())
  }
  if (path.endsWith('/models')) add(path)
  else if (path.endsWith('/v1')) add(`${path}/models`)
  else {
    add(`${path}/v1/models`)
    add(`${path}/models`)
  }
  return [...candidates].map((value) => new URL(value))
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function findModelArray(value: unknown, depth = 0): unknown[] | null {
  if (Array.isArray(value)) return value
  if (depth > 4) return null
  const record = asRecord(value)
  if (!record) return null
  for (const key of ['data', 'models', 'result', 'items']) {
    const child = record[key]
    if (Array.isArray(child)) return child
  }
  for (const key of ['data', 'result', 'response', 'payload']) {
    const found = findModelArray(record[key], depth + 1)
    if (found) return found
  }
  return null
}

function textField(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
}

function inferType(record: Record<string, unknown>, id: string): Pick<DiscoveredModel, 'suggestedType' | 'confidence' | 'reason'> {
  const metadata = [record.type, record.modality, record.task, record.capability, record.object]
    .filter((value): value is string => typeof value === 'string').join(' ').toLowerCase()
  const modalities = Array.isArray(record.modalities) ? record.modalities.join(' ').toLowerCase() : ''
  const explicit = `${metadata} ${modalities}`
  if (/\b(image|text-to-image|image-generation)\b/.test(explicit)) return { suggestedType: 'image', confidence: 'high', reason: 'metadata:image' }
  if (/\b(video|text-to-video|video-generation)\b/.test(explicit)) return { suggestedType: 'video', confidence: 'high', reason: 'metadata:video' }
  if (/\b(audio|speech|tts|voice|transcription)\b/.test(explicit)) return { suggestedType: 'audio', confidence: 'high', reason: 'metadata:audio' }
  if (/\b(llm|chat|text|language)\b/.test(explicit)) return { suggestedType: 'llm', confidence: 'high', reason: 'metadata:llm' }
  const name = id.toLowerCase()
  if (/(dall-e|stable-diffusion|flux|image)/.test(name)) return { suggestedType: 'image', confidence: 'medium', reason: 'name:image' }
  if (/(sora|veo|kling|video)/.test(name)) return { suggestedType: 'video', confidence: 'medium', reason: 'name:video' }
  if (/(whisper|tts|speech|audio|voice)/.test(name)) return { suggestedType: 'audio', confidence: 'medium', reason: 'name:audio' }
  return { suggestedType: 'llm', confidence: 'low', reason: 'fallback:llm' }
}

export function parseDiscoveredModels(payload: unknown): DiscoveredModel[] {
  const items = findModelArray(payload) ?? []
  const models: DiscoveredModel[] = []
  for (const item of items) {
    if (typeof item === 'string' && item.trim()) {
      const id = item.trim()
      models.push({ id, ...inferType({}, id) })
      continue
    }
    const record = asRecord(item)
    if (!record) continue
    const id = textField(record, ['id', 'model', 'modelId', 'name'])
    if (!id) continue
    const name = textField(record, ['name', 'display_name', 'displayName'])
    const ownedBy = textField(record, ['owned_by', 'ownedBy', 'owner', 'organization'])
    models.push({ id, ...(name && name !== id ? { name } : {}), ...(ownedBy ? { ownedBy } : {}), ...inferType(record, id) })
  }
  return models
}

function paginationUrl(payload: unknown, current: URL): URL | null {
  const record = asRecord(payload)
  if (!record) return null
  const page = asRecord(record.pagination) ?? asRecord(record.meta) ?? record
  const next = textField(page, ['next', 'next_url', 'nextUrl'])
  if (next) return new URL(next, current)
  const hasMore = page.has_more === true || page.hasMore === true
  if (!hasMore) return null
  const cursor = textField(page, ['after', 'next_cursor', 'nextCursor'])
  if (cursor) {
    const url = new URL(current)
    url.searchParams.set('after', cursor)
    return url
  }
  const nextPage = page.next_page ?? page.nextPage
  if (typeof nextPage === 'number' || typeof nextPage === 'string') {
    const url = new URL(current)
    url.searchParams.set('page', String(nextPage))
    return url
  }
  return null
}

async function readJsonLimited(response: FetchLikeResponse): Promise<unknown> {
  const length = Number(response.headers.get('content-length') || '0')
  if (length > MAX_RESPONSE_BYTES) throw new ModelDiscoveryError('UPSTREAM_RESPONSE', 'Response body is too large')
  const text = await response.text()
  if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) throw new ModelDiscoveryError('UPSTREAM_RESPONSE', 'Response body is too large')
  try { return JSON.parse(text) } catch { throw new ModelDiscoveryError('UPSTREAM_RESPONSE', 'Upstream returned invalid JSON') }
}

async function discoverUncached(input: { baseUrl: string; apiKey: string; fetchImpl?: FetchLike; lookup?: LookupLike }): Promise<ModelDiscoveryResult> {
  const base = await validateDiscoveryUrl(input.baseUrl, { lookup: input.lookup })
  const warnings: string[] = []
  let lastError: ModelDiscoveryError | null = null
  for (const candidate of endpointCandidates(base.toString())) {
    let current: URL | null = candidate
    const collected = new Map<string, DiscoveredModel>()
    for (let pageIndex = 0; current && pageIndex < MAX_PAGES; pageIndex += 1) {
      try {
        const safeUrl = await validateDiscoveryUrl(current, { lookup: input.lookup })
        if (safeUrl.origin !== base.origin) throw new ModelDiscoveryError('SSRF_BLOCKED', 'Pagination must remain on the provider origin')
        const response = input.fetchImpl
          ? await input.fetchImpl(safeUrl.toString(), {
            method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            headers: { Authorization: `Bearer ${input.apiKey}`, Accept: 'application/json' },
          })
          : await safeOutboundFetch(safeUrl, {
            method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            headers: { Authorization: `Bearer ${input.apiKey}`, Accept: 'application/json' },
          }, { lookup: input.lookup })
        if (response.status >= 300 && response.status < 400) throw new ModelDiscoveryError('SSRF_BLOCKED', 'Redirects are disabled', response.status)
        if (!response.ok) {
          const code = response.status === 401 || response.status === 403 ? 'UPSTREAM_AUTH' : 'UPSTREAM_HTTP'
          throw new ModelDiscoveryError(code, `Upstream returned HTTP ${response.status}`, response.status)
        }
        const payload = await readJsonLimited(response)
        for (const model of parseDiscoveredModels(payload)) {
          if (!collected.has(model.id)) collected.set(model.id, model)
          if (collected.size >= MAX_MODELS) break
        }
        if (collected.size >= MAX_MODELS) {
          warnings.push('MODEL_LIMIT_REACHED')
          current = null
        } else {
          const next = paginationUrl(payload, safeUrl)
          if (next && next.origin !== base.origin) throw new ModelDiscoveryError('SSRF_BLOCKED', 'Cross-origin pagination is not allowed')
          current = next
          if (current && pageIndex === MAX_PAGES - 1) warnings.push('PAGE_LIMIT_REACHED')
        }
      } catch (error) {
        lastError = error instanceof ModelDiscoveryError ? error : new ModelDiscoveryError('NETWORK', 'Provider request failed')
        warnings.push(`${lastError.code}:${candidate.pathname}`)
        break
      }
    }
    if (collected.size) {
      return {
        models: [...collected.values()].sort((a, b) => a.id.localeCompare(b.id, 'en')),
        discoveredAt: new Date().toISOString(), partial: warnings.length > 0, warnings, cacheHit: false,
      }
    }
  }
  throw lastError ?? new ModelDiscoveryError('NO_MODELS', 'No models were returned')
}

export function apiKeyFingerprint(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex')
}

export async function discoverModels(input: {
  userId: string; providerId: string; baseUrl: string; apiKey: string; forceRefresh?: boolean
  fetchImpl?: FetchLike; lookup?: LookupLike
}): Promise<ModelDiscoveryResult> {
  const key = createHash('sha256').update(`${input.userId}\0${input.providerId}\0${input.baseUrl}\0${apiKeyFingerprint(input.apiKey)}`).digest('hex')
  const cached = cache.get(key)
  if (!input.forceRefresh && cached && cached.expiresAt > Date.now()) return { ...cached.value, cacheHit: true }
  if (!input.forceRefresh) {
    const active = pending.get(key)
    if (active) return active
  }
  const promise = discoverUncached(input).then((result) => {
    cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value: result })
    return result
  }).finally(() => pending.delete(key))
  pending.set(key, promise)
  return promise
}

export function clearModelDiscoveryCache(): void {
  cache.clear()
  pending.clear()
}
