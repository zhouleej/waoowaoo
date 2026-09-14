import { beforeEach, describe, expect, it, vi } from 'vitest'

const storageMocks = vi.hoisted(() => ({
  getSignedUrl: vi.fn((key: string, ttl: number) => `/api/storage/sign?key=${key}&expires=${ttl}`),
  getStorageProxyUrl: vi.fn((key: string, ttl: number) => `/api/storage/proxy?key=${key}&expires=${ttl}`),
  getStorageDownloadUrl: vi.fn((key: string, filename: string, ttl: number) => (
    `/api/storage/proxy?key=${key}&filename=${filename}&expires=${ttl}`
  )),
}))

vi.mock('@/lib/storage', () => storageMocks)

import { buildInspirationVideoDeliveryUrls } from '@/lib/inspiration-video/media-delivery'

describe('inspiration video media delivery', () => {
  beforeEach(() => vi.clearAllMocks())

  it('uses direct signed storage playback and keeps the application proxy as fallback', () => {
    const urls = buildInspirationVideoDeliveryUrls(
      'images/inspiration-video-creation.mp4',
      '灵感视频_creation.mp4',
    )

    expect(storageMocks.getSignedUrl).toHaveBeenCalledWith(
      'images/inspiration-video-creation.mp4',
      7_200,
    )
    expect(storageMocks.getStorageProxyUrl).toHaveBeenCalledWith(
      'images/inspiration-video-creation.mp4',
      7_200,
    )
    expect(storageMocks.getStorageDownloadUrl).toHaveBeenCalledWith(
      'images/inspiration-video-creation.mp4',
      '灵感视频_creation.mp4',
      7_200,
    )
    expect(urls).toEqual({
      videoUrl: '/api/storage/sign?key=images/inspiration-video-creation.mp4&expires=7200',
      videoFallbackUrl: '/api/storage/proxy?key=images/inspiration-video-creation.mp4&expires=7200',
      downloadUrl: '/api/storage/proxy?key=images/inspiration-video-creation.mp4&filename=灵感视频_creation.mp4&expires=7200',
    })
  })
})
