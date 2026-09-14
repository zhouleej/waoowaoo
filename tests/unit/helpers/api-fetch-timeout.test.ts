import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiRequestTimeoutError, apiFetchWithTimeout } from '@/lib/api-fetch'

describe('apiFetchWithTimeout', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('aborts a request and exposes a typed timeout error', async () => {
    vi.useFakeTimers()
    vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
    }))

    const request = apiFetchWithTimeout('/api/slow', undefined, 250)
    const assertion = expect(request).rejects.toMatchObject({
      name: 'ApiRequestTimeoutError',
      timeoutMs: 250,
    })
    await vi.advanceTimersByTimeAsync(250)

    await assertion
  })

  it('does not convert an external cancellation into a timeout', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
    }))
    const controller = new AbortController()
    const request = apiFetchWithTimeout('/api/canceled', { signal: controller.signal }, 10_000)

    controller.abort()

    await expect(request).rejects.not.toBeInstanceOf(ApiRequestTimeoutError)
  })

  it('clears the timeout after a successful response', async () => {
    vi.useFakeTimers()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }))

    await expect(apiFetchWithTimeout('/api/fast', undefined, 250)).resolves.toMatchObject({ status: 204 })
    expect(vi.getTimerCount()).toBe(0)
  })
})
