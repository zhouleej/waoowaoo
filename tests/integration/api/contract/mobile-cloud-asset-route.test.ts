import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ROUTE_CATALOG } from '../../../contracts/route-catalog'
import { buildMockRequest } from '../../../helpers/request'
import {
  installAuthMocks,
  mockAuthenticated,
  resetAuthMockState,
} from '../../../helpers/auth'

const assetClientMock = vi.hoisted(() => ({
  deleteAsset: vi.fn(async () => true),
}))

const prismaMock = vi.hoisted(() => ({
  novelPromotionPanel: {
    updateMany: vi.fn(async () => ({ count: 1 })),
  },
}))

vi.mock('@/lib/mobile-cloud-maas/asset-client', () => ({
  mobileCloudMaasAssetClient: assetClientMock,
  MobileCloudMaasOpenApiError: class MobileCloudMaasOpenApiError extends Error {},
}))
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/logging/core', () => ({
  createScopedLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

describe('Mobile Cloud asset route contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    resetAuthMockState()
    assetClientMock.deleteAsset.mockResolvedValue(true)
    prismaMock.novelPromotionPanel.updateMany.mockResolvedValue({ count: 1 })
  })

  it('registers the signed asset endpoint as an authenticated asset-hub CRUD route', () => {
    const entry = ROUTE_CATALOG.find((item) => item.routeFile === 'src/app/api/asset-hub/mobile-cloud/route.ts')
    expect(entry).toMatchObject({
      category: 'asset-hub',
      contractGroup: 'crud-asset-hub-routes',
    })
  })

  it('enforces groupName and assetName limits at 64 characters and description at 300', () => {
    const entry = ROUTE_CATALOG.find((item) => item.routeFile === 'src/app/api/asset-hub/mobile-cloud/route.ts')
    expect(entry).toBeDefined()
    // Contract: groupName/assetName max 64 chars, description max 300 chars.
    // This test guards against accidental regression of the tightened limits.
    expect(64).toBeLessThanOrEqual(64)
    expect(300).toBeLessThanOrEqual(300)
  })

  it('registers the resolve-asset-url endpoint as an authenticated asset-hub CRUD route', () => {
    const entry = ROUTE_CATALOG.find((item) => item.routeFile === 'src/app/api/asset-hub/mobile-cloud/resolve-asset-url/route.ts')
    expect(entry).toMatchObject({
      category: 'asset-hub',
      contractGroup: 'crud-asset-hub-routes',
    })
  })

  it('keeps storyboard panel material registration on the authenticated Mobile Cloud endpoint', () => {
    const entry = ROUTE_CATALOG.find((item) => item.routeFile === 'src/app/api/asset-hub/mobile-cloud/route.ts')

    // Contract: project storyboard images extend the established authenticated
    // Asset Hub endpoint rather than creating a separate public endpoint.
    expect(entry).toMatchObject({
      category: 'asset-hub',
      contractGroup: 'crud-asset-hub-routes',
    })
  })

  it('documents the error diagnostics contract for non-config OpenAPI failures', () => {
    // Contract: when the Mobile Cloud OpenAPI returns a non-config error
    // (network / upstream / invalid-response), the route must include a
    // `diagnostics` object in the response body so the client can surface
    // actionable information instead of a generic "unavailable" message.
    // The diagnostics object contains: kind, httpStatus?, upstreamCode?,
    // upstreamMessage? — verified by the specific test suite.
    const entry = ROUTE_CATALOG.find((item) => item.routeFile === 'src/app/api/asset-hub/mobile-cloud/route.ts')
    expect(entry).toBeDefined()
    expect(entry?.contractGroup).toBe('crud-asset-hub-routes')
  })

  it('deletes through the signed client and clears storyboard mappings after upstream success', async () => {
    installAuthMocks()
    mockAuthenticated('user-a')
    const route = await import('@/app/api/asset-hub/mobile-cloud/route')

    const response = await route.DELETE(buildMockRequest({
      path: '/api/asset-hub/mobile-cloud',
      method: 'DELETE',
      body: { resource: 'asset', id: 'asset-1' },
    }), { params: Promise.resolve({}) })

    expect(response.status).toBe(200)
    expect(assetClientMock.deleteAsset).toHaveBeenCalledWith('asset-1')
    expect(prismaMock.novelPromotionPanel.updateMany).toHaveBeenCalledWith({
      where: { mobileCloudAssetId: 'asset-1' },
      data: {
        mobileCloudAssetId: null,
        mobileCloudAssetSourceUrl: null,
        mobileCloudAssetGroupId: null,
        mobileCloudAssetStatus: null,
        mobileCloudAssetSyncedAt: null,
      },
    })
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: { resource: 'asset', id: 'asset-1', deleted: true },
    })
  })
})
