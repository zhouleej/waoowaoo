import { createHmac, timingSafeEqual } from 'node:crypto'

const DEFAULT_PROXY_TTL_SECONDS = 3_600
const MAX_PROXY_TTL_SECONDS = 24 * 60 * 60
const SHA256_HEX_LENGTH = 64

function getProxySecret(): string {
  const secret = process.env.STORAGE_PROXY_SECRET?.trim() || process.env.NEXTAUTH_SECRET?.trim()
  if (!secret) throw new Error('STORAGE_PROXY_SECRET_MISSING')
  return secret
}

function signStorageProxyValue(key: string, expiresAt: number): string {
  return createHmac('sha256', getProxySecret())
    .update(`${key}\n${expiresAt}`)
    .digest('hex')
}

function isValidStorageKey(key: string): boolean {
  return key.length > 0 && key.length <= 2_048 && !key.includes('\0')
}

export function getStorageProxyUrl(
  key: string,
  expiresInSeconds: number = DEFAULT_PROXY_TTL_SECONDS,
): string {
  if (!isValidStorageKey(key)) throw new Error('STORAGE_PROXY_KEY_INVALID')
  const ttl = Number.isFinite(expiresInSeconds)
    ? Math.min(MAX_PROXY_TTL_SECONDS, Math.max(1, Math.floor(expiresInSeconds)))
    : DEFAULT_PROXY_TTL_SECONDS
  const expiresAt = Math.floor(Date.now() / 1_000) + ttl
  const signature = signStorageProxyValue(key, expiresAt)
  return `/api/storage/proxy?key=${encodeURIComponent(key)}&expires=${expiresAt}&signature=${signature}`
}

export function verifyStorageProxySignature(
  key: string,
  expiresAt: number,
  signature: string,
): boolean {
  if (
    !isValidStorageKey(key)
    || !Number.isSafeInteger(expiresAt)
    || !/^[a-f0-9]{64}$/i.test(signature)
  ) {
    return false
  }

  const now = Math.floor(Date.now() / 1_000)
  if (expiresAt <= now || expiresAt > now + MAX_PROXY_TTL_SECONDS) return false

  const expected = Buffer.from(signStorageProxyValue(key, expiresAt), 'hex')
  const actual = Buffer.from(signature, 'hex')
  return expected.length === SHA256_HEX_LENGTH / 2
    && actual.length === expected.length
    && timingSafeEqual(actual, expected)
}
