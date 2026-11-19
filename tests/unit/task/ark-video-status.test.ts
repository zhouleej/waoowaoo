import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { querySeedanceVideoStatus } from '@/lib/async-task-utils'

describe('Ark video status failure handling', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => vi.unstubAllGlobals())

  it.each(['cancelled', 'expired'])('stops polling a %s task', async (status) => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ status })))
    expect(await querySeedanceVideoStatus('cgt-task', 'ark-test-key')).toEqual({ status: 'failed', error: `Ark video task ${status}` })
  })

  it.each([400, 401, 403, 404, 422])('stops on permanent HTTP %s instead of waiting indefinitely', async (status) => {
    fetchMock.mockResolvedValue(new Response('upstream echoed ark-test-key', { status }))
    const result = await querySeedanceVideoStatus('cgt-task', 'ark-test-key')
    expect(result).toMatchObject({ status: 'failed', error: expect.stringContaining(`HTTP ${status}`) })
    expect(result.error).not.toContain('ark-test-key')
  })

  it.each([408, 429, 500, 503])('allows retry after transient HTTP %s', async (status) => {
    fetchMock.mockResolvedValue(new Response('{}', { status }))
    expect(await querySeedanceVideoStatus('cgt-task', 'ark-test-key')).toEqual({ status: 'pending' })
  })

  it('uses a timeout for status queries', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ status: 'running' })))
    await querySeedanceVideoStatus('cgt-task', 'ark-test-key')
    expect(fetchMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal)
  })
})
