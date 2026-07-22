import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearModelDiscoveryCache,
  discoverModels,
  ModelDiscoveryError,
  parseDiscoveredModels,
  validateDiscoveryUrl,
} from '@/lib/user-api/model-discovery'

const publicLookup = vi.fn(async () => [{ address: '203.0.113.20', family: 4 }])

function response(payload: unknown, status = 200, headers: Record<string, string> = {}) {
  const text = JSON.stringify(payload)
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? (name.toLowerCase() === 'content-length' ? String(text.length) : null) },
    json: async () => payload,
    text: async () => text,
  }
}

describe('model discovery parsing', () => {
  it('parses common roots, object fields, metadata and deduplicates later in discovery', () => {
    expect(parseDiscoveredModels({ result: { items: [
      'gpt-x',
      { modelId: 'flux-1', displayName: 'Flux', owned_by: 'vendor', modalities: ['image'] },
      { model: 'voice-1', type: 'speech' },
    ] } })).toEqual([
      expect.objectContaining({ id: 'gpt-x', suggestedType: 'llm', confidence: 'low' }),
      expect.objectContaining({ id: 'flux-1', name: 'Flux', ownedBy: 'vendor', suggestedType: 'image', confidence: 'high' }),
      expect.objectContaining({ id: 'voice-1', suggestedType: 'audio', confidence: 'high' }),
    ])
  })
})

describe('model discovery SSRF', () => {
  it.each(['http://localhost:3000', 'http://service', 'http://api.local', 'http://127.0.0.1', 'http://[::1]', 'http://[::ffff:7f00:1]', 'http://[::ffff:127.0.0.1]'])('rejects internal URL %s', async (url) => {
    await expect(validateDiscoveryUrl(url, { production: false, lookup: publicLookup })).rejects.toBeInstanceOf(ModelDiscoveryError)
  })

  it('requires https in production and checks every DNS answer', async () => {
    await expect(validateDiscoveryUrl('http://models.example.com', { production: true, lookup: publicLookup })).rejects.toMatchObject({ code: 'SSRF_BLOCKED' })
    const mixedLookup = vi.fn(async () => [{ address: '203.0.113.20', family: 4 }, { address: '10.0.0.2', family: 4 }])
    await expect(validateDiscoveryUrl('https://models.example.com', { lookup: mixedLookup })).rejects.toMatchObject({ code: 'SSRF_BLOCKED' })
  })

  it('blocks redirects without following them', async () => {
    const fetchImpl = vi.fn(async () => response({}, 302, { location: 'http://169.254.169.254/latest' }))
    await expect(discoverModels({ userId: 'u', providerId: 'openai-compatible:x', baseUrl: 'https://models.example.com', apiKey: 'secret', fetchImpl, lookup: publicLookup, forceRefresh: true })).rejects.toMatchObject({ code: 'SSRF_BLOCKED' })
    expect(fetchImpl).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ redirect: 'manual' }))
  })
})

describe('model discovery pagination and cache', () => {
  beforeEach(() => clearModelDiscoveryCache())

  it('follows same-origin cursor pagination, deduplicates and sorts', async () => {
    const fetchImpl = vi.fn(async (url: string) => url.includes('after=cursor-2')
      ? response({ data: [{ id: 'alpha' }, { id: 'beta' }], has_more: false })
      : response({ data: [{ id: 'zeta' }, { id: 'beta' }], has_more: true, after: 'cursor-2' }))
    const result = await discoverModels({ userId: 'u', providerId: 'openai-compatible:x', baseUrl: 'https://models.example.com/v1', apiKey: 'secret', fetchImpl, lookup: publicLookup })
    expect(result.models.map((model) => model.id)).toEqual(['alpha', 'beta', 'zeta'])
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('merges concurrent requests and returns short-lived cache hits without exposing keys', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const fetchImpl = vi.fn(async () => { await gate; return response({ data: [{ id: 'model-1' }] }) })
    const input = { userId: 'u', providerId: 'openai-compatible:x', baseUrl: 'https://models.example.com/v1', apiKey: 'super-secret', fetchImpl, lookup: publicLookup }
    const first = discoverModels(input)
    const second = discoverModels(input)
    release()
    const results = await Promise.all([first, second])
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(results)).not.toContain('super-secret')
    expect((await discoverModels(input)).cacheHit).toBe(true)
  })
})
