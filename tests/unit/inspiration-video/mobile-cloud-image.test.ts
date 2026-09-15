import { beforeEach, describe, expect, it, vi } from 'vitest'

const assetClientMock = vi.hoisted(() => ({ getAsset: vi.fn() }))
const withSafeResponseMock = vi.hoisted(() => vi.fn())

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
  return { SafeOutboundError, withSafeOutboundResponse: withSafeResponseMock }
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
    withSafeResponseMock.mockImplementation(async (
      _url: URL,
      _init: RequestInit,
      consume: (response: Response) => Promise<unknown>,
    ) => consume(new Response('image-body', { status: 200 })))
  })

  it('loads an active image using its server-resolved URL', async () => {
    const { loadMobileCloudImage } = await import('@/lib/inspiration-video/mobile-cloud-image')
    const result = await loadMobileCloudImage('asset-1', 'primaryMobileCloudAssetId')

    expect(assetClientMock.getAsset).toHaveBeenCalledWith('asset-1')
    expect(withSafeResponseMock).toHaveBeenCalledWith(
      new URL('https://assets.example.com/key.png'),
      expect.objectContaining({ method: 'GET' }),
      expect.any(Function),
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
    expect(withSafeResponseMock).not.toHaveBeenCalled()
  })

  it('rejects a declared image size above the shared image limit', async () => {
    const { loadMobileCloudImage } = await import('@/lib/inspiration-video/mobile-cloud-image')
    withSafeResponseMock.mockImplementationOnce(async (
      _url: URL,
      _init: RequestInit,
      consume: (response: Response) => Promise<unknown>,
    ) => consume(new Response('small', {
      status: 200,
      headers: { 'content-length': String(10 * 1024 * 1024 + 1) },
    })))

    await expect(loadMobileCloudImage('asset-1', 'primaryMobileCloudAssetId')).rejects.toMatchObject({
      code: 'INVALID_PARAMS',
    })
  })

  it('follows redirects while each response is consumed before its pinned connection closes', async () => {
    withSafeResponseMock
      .mockImplementationOnce(async (
        _url: URL,
        _init: RequestInit,
        consume: (response: Response) => Promise<unknown>,
      ) => consume(new Response(null, {
        status: 302,
        headers: { location: 'https://cdn.example.com/key.png' },
      })))
      .mockImplementationOnce(async (
        _url: URL,
        _init: RequestInit,
        consume: (response: Response) => Promise<unknown>,
      ) => consume(new Response('redirected-image', { status: 200 })))

    const { loadMobileCloudImage } = await import('@/lib/inspiration-video/mobile-cloud-image')
    const result = await loadMobileCloudImage('asset-1', 'primaryMobileCloudAssetId')

    expect(withSafeResponseMock).toHaveBeenNthCalledWith(
      2,
      new URL('https://cdn.example.com/key.png'),
      expect.objectContaining({ method: 'GET' }),
      expect.any(Function),
    )
    expect(result.body.toString()).toBe('redirected-image')
  })
})
