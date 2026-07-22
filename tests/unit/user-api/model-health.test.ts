import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  models: [] as Array<Record<string, unknown>>,
  provider: { id: 'openai-compatible:p1', name: 'Compat', baseUrl: 'https://compat.example.com/v1', apiKey: 'secret' },
  upsert: vi.fn(),
  findUnique: vi.fn(async () => null),
  findMany: vi.fn(async () => []),
}))

vi.mock('@/lib/api-config', () => ({
  getProviderKey: (id: string) => id.split(':')[0],
  getUserModels: vi.fn(async () => state.models),
  getProviderConfig: vi.fn(async (_userId: string, providerId: string) => {
    if (providerId !== state.provider.id) throw new Error('PROVIDER_NOT_FOUND')
    return state.provider
  }),
}))
vi.mock('@/lib/llm/chat-completion', () => ({ chatCompletion: vi.fn(async () => ({ choices: [] })) }))
vi.mock('@/lib/prisma', () => ({ prisma: { modelHealthStatus: { upsert: state.upsert, findUnique: state.findUnique, findMany: state.findMany } } }))
vi.mock('@/lib/security/safe-outbound-http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/security/safe-outbound-http')>()
  return { ...actual, safeOutboundFetch: (url: URL, init: RequestInit) => fetch(url, init) }
})
vi.mock('node:dns/promises', () => ({ lookup: vi.fn(async () => [{ address: '203.0.113.10', family: 4 }]) }))

import { checkModelHealth, checkProviderHealth, clearModelHealthRuntimeState } from '@/lib/user-api/model-health'

function model(modelId: string, type: 'llm' | 'image' | 'video' = 'llm', protocol?: 'responses' | 'chat-completions') {
  return { modelId, modelKey: `openai-compatible:p1::${modelId}`, name: modelId, type, provider: 'openai-compatible:p1', price: 0, ...(protocol ? { llmProtocol: protocol } : {}) }
}

describe('model health service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearModelHealthRuntimeState()
    state.models = []
    state.provider = { id: 'openai-compatible:p1', name: 'Compat', baseUrl: 'https://compat.example.com/v1', apiKey: 'secret' }
    state.findUnique.mockResolvedValue(null)
  })

  it('checks the saved concrete model with its saved protocol and persists healthy', async () => {
    state.models = [model('gpt-concrete', 'llm', 'responses')]
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ output: [] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const health = await checkModelHealth({ userId: 'u1', providerId: 'openai-compatible:p1', modelKey: 'openai-compatible:p1::gpt-concrete' })
    expect(health).toMatchObject({ status: 'healthy', checkLevel: 'inference', modelId: 'gpt-concrete', protocol: 'responses' })
    const firstCall = fetchMock.mock.calls[0] as unknown as [unknown, RequestInit]
    expect(JSON.parse(String(firstCall[1].body))).toMatchObject({ model: 'gpt-concrete', max_output_tokens: 8 })
    expect(state.upsert).toHaveBeenCalledOnce()
    expect(state.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId_providerId_modelKeyHash: expect.objectContaining({ modelKeyHash: expect.stringMatching(/^[a-f0-9]{64}$/) }) },
    }))
  })

  it.each([[401, 'unhealthy', 'AUTH_FAILED'], [429, 'degraded', 'RATE_LIMITED'], [503, 'degraded', 'UPSTREAM_UNAVAILABLE']] as const)('classifies HTTP %s', async (status, expected, code) => {
    state.models = [model('gpt-x')]
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status })))
    const health = await checkModelHealth({ userId: 'u1', providerId: 'openai-compatible:p1', modelKey: 'openai-compatible:p1::gpt-x' })
    expect(health).toMatchObject({ status: expected, errorCode: code })
  })

  it.each([
    [
      'billing-disabled provider response',
      { error: { message: 'balance billing is disabled for this key; redeem or upgrade a plan to continue', type: 'forbidden_error' }, type: 'error' },
      'PROVIDER_BILLING_UNAVAILABLE',
    ],
    ['invalid key response', { error: { message: 'Invalid API key: sk-sensitive-value', type: 'authentication_error', code: 'invalid_api_key' } }, 'AUTH_FAILED'],
    ['ordinary forbidden response', { error: { message: 'Request forbidden', type: 'forbidden_error' } }, 'ACCESS_FORBIDDEN'],
    ['model permission response', { error: { message: 'Access to this model is denied', type: 'forbidden_error' } }, 'MODEL_ACCESS_FORBIDDEN'],
  ])('classifies HTTP 403 %s without exposing provider details', async (_case, body, code) => {
    state.models = [model('gpt-x')]
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status: 403 })))
    const health = await checkModelHealth({ userId: 'u1', providerId: 'openai-compatible:p1', modelKey: 'openai-compatible:p1::gpt-x' })
    expect(health).toMatchObject({ status: 'unhealthy', errorCode: code })
    expect(health.message).not.toContain('sk-sensitive-value')
    expect(JSON.stringify(health)).not.toContain('balance billing is disabled')
  })

  it('discards an oversized error body and does not expose sensitive content', async () => {
    state.models = [model('gpt-x')]
    const sensitive = `sk-sensitive-value-${'x'.repeat(64 * 1024)}`
    const body = JSON.stringify({ error: { message: `billing is disabled ${sensitive}`, type: 'forbidden_error' } })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status: 403 })))
    const health = await checkModelHealth({ userId: 'u1', providerId: 'openai-compatible:p1', modelKey: 'openai-compatible:p1::gpt-x' })
    expect(health).toMatchObject({ status: 'unhealthy', errorCode: 'ACCESS_FORBIDDEN' })
    expect(JSON.stringify(health)).not.toContain('sk-sensitive-value')
    expect(state.upsert).toHaveBeenCalledWith(expect.not.objectContaining({ message: expect.stringContaining('sk-sensitive-value') }))
  })

  it('uses discovery for media existence without generation', async () => {
    state.models = [model('flux-x', 'image')]
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: [{ id: 'flux-x' }] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const health = await checkModelHealth({ userId: 'u1', providerId: 'openai-compatible:p1', modelKey: 'openai-compatible:p1::flux-x' })
    expect(health).toMatchObject({ status: 'degraded', checkLevel: 'existence', errorCode: 'MODEL_DISCOVERED' })
    const firstCall = fetchMock.mock.calls[0] as unknown as [unknown, RequestInit]
    expect(firstCall[1].method).toBe('GET')
  })

  it('deduplicates an in-flight check and short-term repeated checks', async () => {
    state.models = [model('gpt-x')]
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const input = { userId: 'u1', providerId: 'openai-compatible:p1', modelKey: 'openai-compatible:p1::gpt-x' }
    const [a, b] = await Promise.all([checkModelHealth(input), checkModelHealth(input)])
    await checkModelHealth(input)
    expect(a).toEqual(b)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('isolates identical model keys across users in the in-flight map', async () => {
    state.models = [model('gpt-x')]
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const fetchMock = vi.fn(async () => { await gate; return new Response('{}', { status: 200 }) })
    vi.stubGlobal('fetch', fetchMock)
    const target = { providerId: 'openai-compatible:p1', modelKey: 'openai-compatible:p1::gpt-x' }
    const first = checkModelHealth({ userId: 'u1', ...target })
    const second = checkModelHealth({ userId: 'u2', ...target })
    release()
    await Promise.all([first, second])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('limits provider batch concurrency to two and isolates results', async () => {
    state.models = Array.from({ length: 5 }, (_, index) => model(`gpt-${index}`))
    let active = 0
    let peak = 0
    vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
      active += 1; peak = Math.max(peak, active)
      await new Promise((resolve) => setTimeout(resolve, 5))
      active -= 1
      return new Response('{}', { status: String(input).includes('never') ? 500 : 200 })
    }))
    const batch = await checkProviderHealth({ userId: 'u1', providerId: 'openai-compatible:p1' })
    expect(batch.results).toHaveLength(5)
    expect(peak).toBeLessThanOrEqual(2)
  })

  it('does not send inference for a non-compatible provider', async () => {
    state.provider = { ...state.provider, id: 'gemini-compatible:p1' }
    state.models = [{ ...model('gemini-x'), provider: 'gemini-compatible:p1', modelKey: 'gemini-compatible:p1::gemini-x' }]
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const health = await checkModelHealth({ userId: 'u1', providerId: 'gemini-compatible:p1', modelKey: 'gemini-compatible:p1::gemini-x' })
    expect(health).toMatchObject({ status: 'degraded', checkLevel: 'existence', errorCode: 'CHECK_UNSUPPORTED' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects a model key that does not belong to the saved provider', async () => {
    state.models = [model('gpt-x')]
    await expect(checkModelHealth({ userId: 'u1', providerId: 'openai-compatible:other', modelKey: 'openai-compatible:p1::gpt-x' })).rejects.toThrow('MODEL_HEALTH_MODEL_NOT_FOUND')
  })
})
