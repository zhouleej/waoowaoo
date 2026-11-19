import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { testProviderConnection } from '@/lib/user-api/provider-test'

describe('Ark provider connection', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => vi.unstubAllGlobals())

  it('checks a video-only key without requiring an unrelated text model or starting inference', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: [
      { id: 'doubao-seedance-2-0-260128', domain: 'VideoGeneration' },
    ] })))

    const result = await testProviderConnection({ apiType: 'ark', apiKey: 'ark-test-key' })

    expect(result).toEqual({ success: true, steps: [
      { name: 'models', status: 'pass', message: 'Connected; found 1 models. Model inference was not executed.' },
    ] })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://ark.cn-beijing.volces.com/api/v3/models',
      expect.objectContaining({ method: 'GET', headers: { Authorization: 'Bearer ark-test-key' } }),
    )
    expect(fetchMock.mock.calls[0][1]).not.toHaveProperty('body')
  })

  it('accepts an authenticated account with an empty model list', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: [] })))
    const result = await testProviderConnection({ apiType: 'ark', apiKey: 'ark-test-key' })
    expect(result.success).toBe(true)
    expect(result.steps[0]).toMatchObject({ name: 'models', status: 'pass' })
  })

  it.each([{}, { data: null }, { output_text: 'unrelated response' }])('rejects an invalid success payload: %j', async (body) => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(body)))
    const result = await testProviderConnection({ apiType: 'ark', apiKey: 'ark-test-key' })
    expect(result).toMatchObject({ success: false, steps: [{ name: 'models', status: 'fail', message: 'Invalid response from Ark models API' }] })
  })

  it.each([
    [401, 'Authentication failed (401)'],
    [403, 'Access denied (403); check API Key permissions'],
    [429, 'Rate limited (429)'],
    [503, 'Provider error (503)'],
  ])('classifies HTTP %s without returning upstream credentials', async (status, message) => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: { message: 'echoed ark-test-key' } }), { status }))
    const result = await testProviderConnection({ apiType: 'ark', apiKey: 'ark-test-key' })
    expect(result).toEqual({ success: false, steps: [{ name: 'models', status: 'fail', message }] })
    expect(JSON.stringify(result)).not.toContain('ark-test-key')
  })

  it('reports a timeout separately from an authentication failure', async () => {
    fetchMock.mockRejectedValue(new DOMException('timed out', 'TimeoutError'))
    const result = await testProviderConnection({ apiType: 'ark', apiKey: 'ark-test-key' })
    expect(result).toMatchObject({ success: false, steps: [{ name: 'models', status: 'fail', message: 'Ark connection timed out' }] })
  })

  it('reports server connectivity failure without exposing request details', async () => {
    fetchMock.mockRejectedValue(new Error('fetch failed with ark-test-key'))
    const result = await testProviderConnection({ apiType: 'ark', apiKey: 'ark-test-key' })
    expect(result).toMatchObject({ success: false, steps: [{ name: 'models', status: 'fail', message: 'Ark network connection failed; check server DNS, outbound HTTPS and proxy settings' }] })
    expect(JSON.stringify(result)).not.toContain('ark-test-key')
  })
})
