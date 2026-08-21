import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'
import {
  installAuthMocks,
  mockAuthenticated,
  mockUnauthenticated,
  resetAuthMockState,
} from '../../../helpers/auth'

const prismaMock = vi.hoisted(() => ({
  globalCharacter: {
    findFirst: vi.fn(),
  },
}))

const resolveMediaRefFromLegacyValueMock = vi.hoisted(() => vi.fn())
const getSignedObjectUrlMock = vi.hoisted(() => vi.fn())
const listGlobalLocationBackedAssetsMock = vi.hoisted(() => vi.fn())
const decodeImageUrlsFromDbMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))
vi.mock('@/lib/media/service', () => ({
  resolveMediaRefFromLegacyValue: resolveMediaRefFromLegacyValueMock,
}))
vi.mock('@/lib/storage', () => ({
  getSignedObjectUrl: getSignedObjectUrlMock,
}))
vi.mock('@/lib/assets/services/location-backed-assets', () => ({
  listGlobalLocationBackedAssets: listGlobalLocationBackedAssetsMock,
}))
vi.mock('@/lib/contracts/image-urls-contract', () => ({
  decodeImageUrlsFromDb: decodeImageUrlsFromDbMock,
}))

describe('api specific - Mobile Cloud resolve-asset-url route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    resetAuthMockState()
    decodeImageUrlsFromDbMock.mockReturnValue([])
    resolveMediaRefFromLegacyValueMock.mockResolvedValue(null)
    getSignedObjectUrlMock.mockResolvedValue('https://oss.example.com/signed-url')
    listGlobalLocationBackedAssetsMock.mockResolvedValue([])
  })

  it('protects the resolve-asset-url endpoint behind application authentication', async () => {
    installAuthMocks()
    mockUnauthenticated()
    const mod = await import('@/app/api/asset-hub/mobile-cloud/resolve-asset-url/route')
    const response = await mod.GET(buildMockRequest({
      path: '/api/asset-hub/mobile-cloud/resolve-asset-url?kind=character&assetId=char-1',
      method: 'GET',
    }), { params: Promise.resolve({}) })
    expect(response.status).toBe(401)
    expect(prismaMock.globalCharacter.findFirst).not.toHaveBeenCalled()
  })

  it('rejects requests with an invalid kind parameter', async () => {
    installAuthMocks()
    mockAuthenticated('user-a')
    const mod = await import('@/app/api/asset-hub/mobile-cloud/resolve-asset-url/route')
    const response = await mod.GET(buildMockRequest({
      path: '/api/asset-hub/mobile-cloud/resolve-asset-url?kind=voice&assetId=char-1',
      method: 'GET',
    }), { params: Promise.resolve({}) })
    expect(response.status).toBe(400)
    expect(prismaMock.globalCharacter.findFirst).not.toHaveBeenCalled()
  })

  it('rejects requests with a missing assetId parameter', async () => {
    installAuthMocks()
    mockAuthenticated('user-a')
    const mod = await import('@/app/api/asset-hub/mobile-cloud/resolve-asset-url/route')
    const response = await mod.GET(buildMockRequest({
      path: '/api/asset-hub/mobile-cloud/resolve-asset-url?kind=character',
      method: 'GET',
    }), { params: Promise.resolve({}) })
    expect(response.status).toBe(400)
  })

  it('returns 404 when the character asset is not found', async () => {
    installAuthMocks()
    mockAuthenticated('user-a')
    prismaMock.globalCharacter.findFirst.mockResolvedValueOnce(null)
    const mod = await import('@/app/api/asset-hub/mobile-cloud/resolve-asset-url/route')
    const response = await mod.GET(buildMockRequest({
      path: '/api/asset-hub/mobile-cloud/resolve-asset-url?kind=character&assetId=missing-id',
      method: 'GET',
    }), { params: Promise.resolve({}) })
    expect(response.status).toBe(404)
  })

  it('resolves a character asset to a signed OSS URL', async () => {
    installAuthMocks()
    mockAuthenticated('user-a')
    const mockImageUrl = 'cos://bucket/characters/char-1/img-0.jpg'
    decodeImageUrlsFromDbMock.mockReturnValueOnce([mockImageUrl])
    resolveMediaRefFromLegacyValueMock.mockResolvedValueOnce({
      id: 'media-1',
      publicId: 'pub-1',
      url: '/m/pub-1',
      storageKey: 'characters/char-1/img-0.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1024,
      width: 512,
      height: 768,
      durationMs: null,
    })
    getSignedObjectUrlMock.mockResolvedValueOnce('https://oss.example.com/signed/char-1.jpg')
    prismaMock.globalCharacter.findFirst.mockResolvedValueOnce({
      id: 'char-1',
      name: '林夏',
      userId: 'user-a',
      appearances: [
        { id: 'app-1', appearanceIndex: 0, imageUrls: JSON.stringify([mockImageUrl]), selectedIndex: 0, imageUrl: mockImageUrl },
      ],
    })
    const mod = await import('@/app/api/asset-hub/mobile-cloud/resolve-asset-url/route')
    const response = await mod.GET(buildMockRequest({
      path: '/api/asset-hub/mobile-cloud/resolve-asset-url?kind=character&assetId=char-1',
      method: 'GET',
    }), { params: Promise.resolve({}) })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({
      success: true,
      data: {
        assetName: '林夏',
        signedUrl: 'https://oss.example.com/signed/char-1.jpg',
      },
    })
    expect(prismaMock.globalCharacter.findFirst).toHaveBeenCalledWith({
      where: { id: 'char-1', userId: 'user-a' },
      include: { appearances: { orderBy: { appearanceIndex: 'asc' } } },
    })
    expect(getSignedObjectUrlMock).toHaveBeenCalledWith('characters/char-1/img-0.jpg')
  })

  it('returns NO_RESULT when the character has no image available', async () => {
    installAuthMocks()
    mockAuthenticated('user-a')
    decodeImageUrlsFromDbMock.mockReturnValueOnce([])
    prismaMock.globalCharacter.findFirst.mockResolvedValueOnce({
      id: 'char-2',
      name: '空角色',
      userId: 'user-a',
      appearances: [
        { id: 'app-2', appearanceIndex: 0, imageUrls: null, selectedIndex: null, imageUrl: null },
      ],
    })
    const mod = await import('@/app/api/asset-hub/mobile-cloud/resolve-asset-url/route')
    const response = await mod.GET(buildMockRequest({
      path: '/api/asset-hub/mobile-cloud/resolve-asset-url?kind=character&assetId=char-2',
      method: 'GET',
    }), { params: Promise.resolve({}) })
    expect(response.status).toBe(404)
  })

  it('resolves a location asset to a signed OSS URL', async () => {
    installAuthMocks()
    mockAuthenticated('user-a')
    const mockImageUrl = 'cos://bucket/locations/loc-1/img-0.jpg'
    resolveMediaRefFromLegacyValueMock.mockResolvedValueOnce({
      id: 'media-2',
      publicId: 'pub-2',
      url: '/m/pub-2',
      storageKey: 'locations/loc-1/img-0.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 2048,
      width: 1024,
      height: 768,
      durationMs: null,
    })
    getSignedObjectUrlMock.mockResolvedValueOnce('https://oss.example.com/signed/loc-1.jpg')
    listGlobalLocationBackedAssetsMock.mockResolvedValueOnce([
      {
        id: 'loc-1',
        name: '古典园林',
        userId: 'user-a',
        images: [
          { id: 'img-1', imageIndex: 0, imageUrl: mockImageUrl, isSelected: true },
        ],
      },
    ])
    const mod = await import('@/app/api/asset-hub/mobile-cloud/resolve-asset-url/route')
    const response = await mod.GET(buildMockRequest({
      path: '/api/asset-hub/mobile-cloud/resolve-asset-url?kind=location&assetId=loc-1',
      method: 'GET',
    }), { params: Promise.resolve({}) })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({
      success: true,
      data: {
        assetName: '古典园林',
        signedUrl: 'https://oss.example.com/signed/loc-1.jpg',
      },
    })
    expect(listGlobalLocationBackedAssetsMock).toHaveBeenCalledWith({ userId: 'user-a', kind: 'location' })
    expect(getSignedObjectUrlMock).toHaveBeenCalledWith('locations/loc-1/img-0.jpg')
  })

  it('returns 404 when the location asset is not found', async () => {
    installAuthMocks()
    mockAuthenticated('user-a')
    listGlobalLocationBackedAssetsMock.mockResolvedValueOnce([])
    const mod = await import('@/app/api/asset-hub/mobile-cloud/resolve-asset-url/route')
    const response = await mod.GET(buildMockRequest({
      path: '/api/asset-hub/mobile-cloud/resolve-asset-url?kind=location&assetId=missing-loc',
      method: 'GET',
    }), { params: Promise.resolve({}) })
    expect(response.status).toBe(404)
  })

  it('resolves a prop asset to a signed OSS URL', async () => {
    installAuthMocks()
    mockAuthenticated('user-a')
    const mockImageUrl = 'cos://bucket/props/prop-1/img-0.jpg'
    resolveMediaRefFromLegacyValueMock.mockResolvedValueOnce({
      id: 'media-3',
      publicId: 'pub-3',
      url: '/m/pub-3',
      storageKey: 'props/prop-1/img-0.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 512,
      width: 256,
      height: 256,
      durationMs: null,
    })
    getSignedObjectUrlMock.mockResolvedValueOnce('https://oss.example.com/signed/prop-1.jpg')
    listGlobalLocationBackedAssetsMock.mockResolvedValueOnce([
      {
        id: 'prop-1',
        name: '青铜匕首',
        userId: 'user-a',
        images: [
          { id: 'img-2', imageIndex: 0, imageUrl: mockImageUrl, isSelected: true },
        ],
      },
    ])
    const mod = await import('@/app/api/asset-hub/mobile-cloud/resolve-asset-url/route')
    const response = await mod.GET(buildMockRequest({
      path: '/api/asset-hub/mobile-cloud/resolve-asset-url?kind=prop&assetId=prop-1',
      method: 'GET',
    }), { params: Promise.resolve({}) })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({
      success: true,
      data: {
        assetName: '青铜匕首',
        signedUrl: 'https://oss.example.com/signed/prop-1.jpg',
      },
    })
    expect(listGlobalLocationBackedAssetsMock).toHaveBeenCalledWith({ userId: 'user-a', kind: 'prop' })
  })
})
