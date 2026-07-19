import { lookup as dnsLookup } from 'node:dns/promises'
import { isIP, type LookupFunction } from 'node:net'
import type { LookupAddress } from 'node:dns'
import { Agent, buildConnector, fetch as undiciFetch, type Dispatcher } from 'undici'

export type OutboundLookup = (hostname: string) => Promise<Array<{ address: string; family: number }>>

export class SafeOutboundError extends Error {
  constructor(public readonly code: 'INVALID_URL' | 'SSRF_BLOCKED' | 'NETWORK', message: string) {
    super(message)
    this.name = 'SafeOutboundError'
  }
}

function privateIpv4(address: string): boolean {
  const parts = address.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true
  const [a, b, c] = parts
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) || (a === 192 && b === 0 && c === 0) ||
    (a === 198 && (b === 18 || b === 19)) || a >= 224
}

function ipv6Words(input: string): number[] | null {
  const address = input.toLowerCase().split('%')[0]
  if (isIP(address) !== 6) return null
  const dotted = address.match(/(\d+\.\d+\.\d+\.\d+)$/)?.[1]
  let value = address
  if (dotted) {
    const bytes = dotted.split('.').map(Number)
    value = `${address.slice(0, -dotted.length)}${((bytes[0] << 8) | bytes[1]).toString(16)}:${((bytes[2] << 8) | bytes[3]).toString(16)}`
  }
  const halves = value.split('::')
  if (halves.length > 2) return null
  const left = halves[0] ? halves[0].split(':') : []
  const right = halves[1] ? halves[1].split(':') : []
  const zeros = halves.length === 2 ? 8 - left.length - right.length : 0
  const words = [...left, ...Array.from({ length: zeros }, () => '0'), ...right].map((word) => Number.parseInt(word || '0', 16))
  return words.length === 8 && words.every((word) => Number.isInteger(word) && word >= 0 && word <= 0xffff) ? words : null
}

export function isBlockedOutboundIp(input: string): boolean {
  const address = input.toLowerCase().split('%')[0]
  if (isIP(address) === 4) return privateIpv4(address)
  const words = ipv6Words(address)
  if (!words) return true
  const [a, b] = words
  if (words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff) {
    return privateIpv4(`${words[6] >> 8}.${words[6] & 255}.${words[7] >> 8}.${words[7] & 255}`)
  }
  return words.every((word) => word === 0) || words.slice(0, 7).every((word) => word === 0) && words[7] === 1 ||
    (a & 0xfe00) === 0xfc00 || (a & 0xffc0) === 0xfe80 || (a & 0xff00) === 0xff00 ||
    (a === 0x2001 && b === 0x0db8) || (a === 0x2001 && b === 0x0002) || a === 0x2002
}

const defaultLookup: OutboundLookup = async (hostname) => dnsLookup(hostname, { all: true, verbatim: true })

export async function resolveSafeOutboundUrl(input: string | URL, options: { lookup?: OutboundLookup; production?: boolean } = {}) {
  let url: URL
  try { url = new URL(input) } catch { throw new SafeOutboundError('INVALID_URL', 'Outbound URL is invalid') }
  const production = options.production ?? process.env.NODE_ENV === 'production'
  if (url.username || url.password || (url.protocol !== 'https:' && (production || url.protocol !== 'http:'))) {
    throw new SafeOutboundError('SSRF_BLOCKED', 'URL protocol or credentials are not allowed')
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase().replace(/\.$/, '')
  if (!hostname || hostname === 'localhost' || (!hostname.includes('.') && !isIP(hostname)) || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    throw new SafeOutboundError('SSRF_BLOCKED', 'Internal hostnames are not allowed')
  }
  let addresses: Array<{ address: string; family: number }>
  if (isIP(hostname)) addresses = [{ address: hostname, family: isIP(hostname) }]
  else {
    try { addresses = await (options.lookup ?? defaultLookup)(hostname) } catch { throw new SafeOutboundError('NETWORK', 'DNS resolution failed') }
  }
  if (!addresses.length || addresses.some(({ address }) => isBlockedOutboundIp(address))) {
    throw new SafeOutboundError('SSRF_BLOCKED', 'DNS resolved to a blocked address')
  }
  return { url, hostname, addresses }
}

export function createPinnedLookup(selected: LookupAddress): LookupFunction {
  return (_hostname, options, callback) => {
    if (options.all) callback(null, [selected])
    else callback(null, selected.address, selected.family)
  }
}

export async function safeOutboundFetch(
  input: string | URL,
  init: RequestInit,
  options: { lookup?: OutboundLookup; production?: boolean; fetchImpl?: (url: string, init: RequestInit & { dispatcher?: Dispatcher }) => Promise<Response> } = {},
): Promise<Response> {
  const resolved = await resolveSafeOutboundUrl(input, options)
  const selected = resolved.addresses[0]
  const connector = buildConnector({
    lookup: createPinnedLookup(selected),
  })
  const agent = new Agent({ connect(options, callback) {
    connector(options, (error, socket) => {
      if (error || !socket) return callback(error, socket)
      if (!socket.remoteAddress || isBlockedOutboundIp(socket.remoteAddress) || !resolved.addresses.some(({ address }) => address === socket.remoteAddress)) {
        socket.destroy()
        return callback(new SafeOutboundError('SSRF_BLOCKED', 'Connected socket address was not validated'), null)
      }
      callback(null, socket)
    })
  } })
  try {
    const fetchImpl = options.fetchImpl ?? (undiciFetch as unknown as typeof options.fetchImpl)
    return await fetchImpl!(resolved.url.toString(), { ...init, redirect: 'manual', dispatcher: agent })
  } finally {
    await agent.close()
  }
}
