import { beforeEach, describe, expect, it, vi } from 'vitest'

const assetClientMock = vi.hoisted(() => ({ getAsset: vi.fn() }))
const safeFetchMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/mobile-cloud-maas/asset-client', () => {
  class MobileCloudMaasOpenApiError extends Error {
    constructor(
      public readonly kind: string,
      message: string,
    ) {
      super(message)
    }
  }
  return {
    MobileCloudMaasOpenApiError,
    mobileCloudMaasAssetClient: assetClientMock,
  }
})

vi.mock('@/lib/security/safe-outbound-http', () => {
  class SafeOutboundError extends Error {
    constructor(public readonly code: string, message: string) {
      super(message)
    }
  }
  return { SafeOutboundError, safeOutboundFetch: safeFetchMock }
})

describe('Mobile Cloud inspiration image import', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    assetClientMock.getAsset.mockResolvedValue({
      assetId: 'asset-1',
      groupId: 'group-1',
      assetName: 'Key image.png',
      assetType: 'Image',
      assetUrl: 'https://assets.example.com/key.png',
      status: 'ACTIVE',
    })
    safeFetchMock.mockResolvedValue(new Response('image-body', { status: 200 }))
  })

  it('loads an active image using its server-resolved URL', async () => {
    const { loadMobileCloudImage } = await import('@/lib/inspiration-video/mobile-cloud-image')
    const result = await loadMobileCloudImage('asset-1', 'primaryMobileCloudAssetId')

    expect(assetClientMock.getAsset).toHaveBeenCalledWith('asset-1')
    expect(safeFetchMock).toHaveBeenCalledWith(
      new URL('https://assets.example.com/key.png'),
      expect.objectContaining({ method: 'GET' }),
    )
    expect(result).toMatchObject({ assetId: 'asset-1', assetName: 'Key image.png' })
    expect(result.body.toString()).toBe('image-body')
  })

  it('rejects non-image and non-active assets before downloading', async () => {
    const { loadMobileCloudImage } = await import('@/lib/inspiration-video/mobile-cloud-image')
    assetClientMock.getAsset.mockResolvedValueOnce({
      assetId: 'asset-1', assetType: 'Video', assetUrl: 'https://assets.example.com/video.mp4', status: 'ACTIVE',
    })
    await expect(loadMobileCloudImage('asset-1', 'primaryMobileCloudAssetId')).rejects.toMatchObject({
      code: 'INVALID_PARAMS',
    })

    assetClientMock.getAsset.mockResolvedValueOnce({
      assetId: 'asset-1', assetType: 'Image', assetUrl: 'https://assets.example.com/key.png', status: 'PROCESSING',
    })
    await expect(loadMobileCloudImage('asset-1', 'primaryMobileCloudAssetId')).rejects.toMatchObject({
      code: 'INVALID_PARAMS',
    })
    expect(safeFetchMock).not.toHaveBeenCalled()
  })

  it('rejects a declared image size above the shared image limit', async () => {
    const { loadMobileCloudImage } = await import('@/lib/inspiration-video/mobile-cloud-image')
    safeFetchMock.mockResolvedValueOnce(new Response('small', {
      status: 200,
      headers: { 'content-length': String(10 * 1024 * 1024 + 1) },
    }))

    await expect(loadMobileCloudImage('asset-1', 'primaryMobileCloudAssetId')).rejects.toMatchObject({
      code: 'INVALID_PARAMS',
    })
  })
})
