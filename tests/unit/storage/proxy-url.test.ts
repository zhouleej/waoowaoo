import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { getStorageProxyUrl, verifyStorageProxySignature } from '@/lib/storage/proxy-url'

describe('storage proxy url', () => {
  const originalSecret = process.env.STORAGE_PROXY_SECRET

  beforeAll(() => {
    process.env.STORAGE_PROXY_SECRET = 'storage-proxy-test-secret'
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-11T05:00:00Z'))
  })

  afterAll(() => {
    vi.useRealTimers()
    if (originalSecret === undefined) delete process.env.STORAGE_PROXY_SECRET
    else process.env.STORAGE_PROXY_SECRET = originalSecret
  })

  it('signs the storage key and expiry and rejects tampering', () => {
    const url = new URL(getStorageProxyUrl('inspiration/video.mp4', 600), 'https://app.example')
    const key = url.searchParams.get('key') || ''
    const expires = Number(url.searchParams.get('expires'))
    const signature = url.searchParams.get('signature') || ''

    expect(key).toBe('inspiration/video.mp4')
    expect(expires).toBe(Math.floor(Date.now() / 1_000) + 600)
    expect(verifyStorageProxySignature(key, expires, signature)).toBe(true)
    expect(verifyStorageProxySignature('inspiration/other.mp4', expires, signature)).toBe(false)
    const replacement = signature.endsWith('0') ? '1' : '0'
    expect(verifyStorageProxySignature(key, expires, `${signature.slice(0, -1)}${replacement}`)).toBe(false)
  })

  it('rejects an expired signature', () => {
    const url = new URL(getStorageProxyUrl('inspiration/video.mp4', 60), 'https://app.example')
    vi.advanceTimersByTime(61_000)

    expect(verifyStorageProxySignature(
      url.searchParams.get('key') || '',
      Number(url.searchParams.get('expires')),
      url.searchParams.get('signature') || '',
    )).toBe(false)
  })
})
