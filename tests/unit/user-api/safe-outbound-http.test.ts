import { createServer } from 'node:http'
import type { AddressInfo, LookupFunction } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Agent, buildConnector, fetch as undiciFetch } from 'undici'
import {
  createPinnedLookup,
  isBlockedOutboundIp,
  safeOutboundFetch,
  withSafeOutboundResponse,
} from '@/lib/security/safe-outbound-http'

const cleanup: Array<() => Promise<void>> = []

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((close) => close()))
})

describe('safe outbound HTTP', () => {
  it.each(['::ffff:7f00:1', '::ffff:127.0.0.1', '::1', 'fc00::1', 'fe80::1', '2001:db8::1'])('blocks special or mapped IPv6 %s', (address) => {
    expect(isBlockedOutboundIp(address)).toBe(true)
  })

  it('pins the single validated DNS result instead of resolving again at request time', async () => {
    const lookup = vi.fn(async () => [{ address: '93.184.216.34', family: 4 }])
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit & { dispatcher?: unknown }) => {
      expect(init.dispatcher).toBeDefined()
      return new Response('{}', { status: 200 })
    })
    const response = await safeOutboundFetch('https://models.example.com/v1/models', { method: 'GET' }, { lookup, fetchImpl })
    expect(response.status).toBe(200)
    expect(lookup).toHaveBeenCalledTimes(1)
  })

  it('lets media callers consume a streamed response before closing its dispatcher', async () => {
    const lookup = vi.fn(async () => [{ address: '93.184.216.34', family: 4 }])
    const fetchImpl = vi.fn(async () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('streamed-image'))
        controller.close()
      },
    }), { status: 200 }))

    const body = await withSafeOutboundResponse(
      'https://assets.example.com/key.png',
      { method: 'GET' },
      async (response) => response.text(),
      { lookup, fetchImpl },
    )

    expect(body).toBe('streamed-image')
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://assets.example.com/key.png',
      expect.objectContaining({ redirect: 'manual', dispatcher: expect.anything() }),
    )
  })

  it('cancels an unconsumed response body before releasing its dispatcher', async () => {
    const cancelled = vi.fn()
    const fetchImpl = vi.fn(async () => new Response(new ReadableStream({
      cancel: cancelled,
    }), { status: 302, headers: { location: 'https://cdn.example.com/key.png' } }))

    const status = await withSafeOutboundResponse(
      'https://assets.example.com/key.png',
      { method: 'GET' },
      async (response) => response.status,
      {
        lookup: async () => [{ address: '93.184.216.34', family: 4 }],
        fetchImpl,
      },
    )

    expect(status).toBe(302)
    expect(cancelled).toHaveBeenCalledTimes(1)
  })

  it('returns the pinned address in the callback shape requested by lookup options', () => {
    const lookup = createPinnedLookup({ address: '93.184.216.34', family: 4 })
    const allCallback = vi.fn()
    const oneCallback = vi.fn()

    lookup('models.example.com', { all: true }, allCallback)
    lookup('models.example.com', { all: false }, oneCallback)

    expect(allCallback).toHaveBeenCalledWith(null, [{ address: '93.184.216.34', family: 4 }])
    expect(oneCallback).toHaveBeenCalledWith(null, '93.184.216.34', 4)
  })

  it('establishes a real local HTTP connection through the custom dispatcher with all lookup mode', async () => {
    const server = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end('{"connected":true}')
    })
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    cleanup.push(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())))
    const { port } = server.address() as AddressInfo
    let requestedAllMode = false
    const pinnedLookup = createPinnedLookup({ address: '127.0.0.1', family: 4 })
    const observingLookup: LookupFunction = (hostname, options, callback) => {
      requestedAllMode ||= options.all === true
      pinnedLookup(hostname, options, callback)
    }
    const agent = new Agent({ connect: buildConnector({ lookup: observingLookup }) })
    cleanup.push(() => agent.close())

    const response = await undiciFetch(`http://local.test:${port}/health`, { dispatcher: agent })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ connected: true })
    expect(requestedAllMode).toBe(true)
  })
})
