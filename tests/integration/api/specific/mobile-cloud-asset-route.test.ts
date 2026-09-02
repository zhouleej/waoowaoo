import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'
import {
  installAuthMocks,
  mockAuthenticated,
  mockUnauthenticated,
  resetAuthMockState,
} from '../../../helpers/auth'

const { assetClientMock, MobileCloudMaasOpenApiError } = vi.hoisted(() => {
  class MobileCloudMaasOpenApiError extends Error {
    constructor(
      public readonly kind: 'config' | 'auth' | 'network' | 'upstream' | 'invalid-response',
      message: string,
      public readonly status?: number,
      public readonly missing: string[] = [],
      public readonly upstreamCode?: string,
    ) {
      super(message)
      this.name = 'MobileCloudMaasOpenApiError'
    }
  }
  return {
    assetClientMock: {
      listGroups: vi.fn(async () => ({ pageNo: 1, pageSize: 50, total: 1, items: [{ groupId: 'g-1', groupType: 'AIGC', groupName: '虚拟人', description: '' }] })),
      listAssets: vi.fn(async () => ({ pageNo: 1, pageSize: 50, total: 0, items: [] })),
      createGroup: vi.fn(),
      createAsset: vi.fn(),
      createRealPersonAuthSession: vi.fn(),
      findGroupByBytedToken: vi.fn(),
      updateGroup: vi.fn(),
      updateAsset: vi.fn(),
      deleteGroup: vi.fn(),
      deleteAsset: vi.fn(),
    },
    MobileCloudMaasOpenApiError,
  }
})

vi.mock('@/lib/mobile-cloud-maas/asset-client', () => ({
  mobileCloudMaasAssetClient: assetClientMock,
  MobileCloudMaasOpenApiError,
}))

vi.mock('@/lib/logging/core', () => ({
  createScopedLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

describe('api specific - Mobile Cloud asset route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    resetAuthMockState()
  })

  it('protects the direct asset API behind application authentication', async () => {
    installAuthMocks()
    mockUnauthenticated()
    const mod = await import('@/app/api/asset-hub/mobile-cloud/route')
    const response = await mod.GET(buildMockRequest({
      path: '/api/asset-hub/mobile-cloud?resource=groups',
      method: 'GET',
    }), { params: Promise.resolve({}) })
    expect(response.status).toBe(401)
    expect(assetClientMock.listGroups).not.toHaveBeenCalled()
  })

  it('forwards the asset-group query to the signed client and returns normalized data', async () => {
    installAuthMocks()
    mockAuthenticated('user-a')
    const mod = await import('@/app/api/asset-hub/mobile-cloud/route')
    const response = await mod.GET(buildMockRequest({
      path: '/api/asset-hub/mobile-cloud?resource=groups&groupType=AIGC&pageNo=2&pageSize=20',
      method: 'GET',
    }), { params: Promise.resolve({}) })
    expect(response.status).toBe(200)
    expect(assetClientMock.listGroups).toHaveBeenCalledWith({ pageNo: 2, pageSize: 20, groupType: 'AIGC' })
    expect(await response.json()).toMatchObject({ success: true, data: { items: [{ groupId: 'g-1' }] } })
  })

  it('requires and forwards groupType when querying assets', async () => {
    installAuthMocks()
    mockAuthenticated('user-a')
    const mod = await import('@/app/api/asset-hub/mobile-cloud/route')
    const response = await mod.GET(buildMockRequest({
      path: '/api/asset-hub/mobile-cloud?resource=assets&groupType=AIGC&groupIds=g-1&pageNo=2&pageSize=20',
      method: 'GET',
    }), { params: Promise.resolve({}) })

    expect(response.status).toBe(200)
    expect(assetClientMock.listAssets).toHaveBeenCalledWith({
      pageNo: 2,
      pageSize: 20,
      groupType: 'AIGC',
      groupIds: ['g-1'],
    })
  })

  it('rejects an asset query without the upstream-required groupType', async () => {
    installAuthMocks()
    mockAuthenticated('user-a')
    const mod = await import('@/app/api/asset-hub/mobile-cloud/route')
    const response = await mod.GET(buildMockRequest({
      path: '/api/asset-hub/mobile-cloud?resource=assets&groupIds=g-1',
      method: 'GET',
    }), { params: Promise.resolve({}) })

    expect(response.status).toBe(400)
    expect(assetClientMock.listAssets).not.toHaveBeenCalled()
  })

  it('rejects group creation with groupName exceeding 64 characters', async () => {
    installAuthMocks()
    mockAuthenticated('user-a')
    const mod = await import('@/app/api/asset-hub/mobile-cloud/route')
    const response = await mod.POST(buildMockRequest({
      path: '/api/asset-hub/mobile-cloud',
      method: 'POST',
      body: { resource: 'group', groupType: 'AIGC', groupName: 'x'.repeat(65) },
    }), { params: Promise.resolve({}) })
    expect(response.status).toBe(400)
    expect(assetClientMock.createGroup).not.toHaveBeenCalled()
  })

  it('creates a group with valid 64-char groupName and 300-char description limits', async () => {
    installAuthMocks()
    mockAuthenticated('user-a')
    assetClientMock.createGroup.mockResolvedValueOnce({ groupId: 'g-new', groupType: 'AIGC', groupName: 'ok', description: 'd' })
    const mod = await import('@/app/api/asset-hub/mobile-cloud/route')
    const response = await mod.POST(buildMockRequest({
      path: '/api/asset-hub/mobile-cloud',
      method: 'POST',
      body: { resource: 'group', groupType: 'AIGC', groupName: 'x'.repeat(64), description: 'd'.repeat(300) },
    }), { params: Promise.resolve({}) })
    expect(response.status).toBe(201)
    expect(assetClientMock.createGroup).toHaveBeenCalledWith({ groupType: 'AIGC', groupName: 'x'.repeat(64), description: 'd'.repeat(300) })
  })

  it('rejects asset update with empty assetName', async () => {
    installAuthMocks()
    mockAuthenticated('user-a')
    const mod = await import('@/app/api/asset-hub/mobile-cloud/route')
    const response = await mod.PUT(buildMockRequest({
      path: '/api/asset-hub/mobile-cloud',
      method: 'PUT',
      body: { resource: 'asset', id: 'asset-1', assetName: '  ' },
    }), { params: Promise.resolve({}) })
    expect(response.status).toBe(400)
    expect(assetClientMock.updateAsset).not.toHaveBeenCalled()
  })

  it('updates an asset with valid 64-char assetName', async () => {
    installAuthMocks()
    mockAuthenticated('user-a')
    assetClientMock.updateAsset.mockResolvedValueOnce({ assetId: 'asset-1', assetName: 'updated' })
    const mod = await import('@/app/api/asset-hub/mobile-cloud/route')
    const response = await mod.PUT(buildMockRequest({
      path: '/api/asset-hub/mobile-cloud',
      method: 'PUT',
      body: { resource: 'asset', id: 'asset-1', assetName: 'x'.repeat(64) },
    }), { params: Promise.resolve({}) })
    expect(response.status).toBe(200)
    expect(assetClientMock.updateAsset).toHaveBeenCalledWith('asset-1', { assetName: 'x'.repeat(64) })
  })

  it('includes diagnostic details when the upstream API rejects the request', async () => {
    installAuthMocks()
    mockAuthenticated('user-a')
    assetClientMock.createAsset.mockRejectedValueOnce(
      new MobileCloudMaasOpenApiError('upstream', 'asset URL is not accessible', 400, [], 'INVALID_ASSET_URL'),
    )
    const mod = await import('@/app/api/asset-hub/mobile-cloud/route')
    const response = await mod.POST(buildMockRequest({
      path: '/api/asset-hub/mobile-cloud',
      method: 'POST',
      body: { resource: 'asset', groupId: 'g-1', assetName: 'test', assetUrl: 'https://example.com/img.png', assetType: 'Image' },
    }), { params: Promise.resolve({}) })
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.success).toBe(false)
    expect(body.error.code).toBe('MOBILE_CLOUD_OPENAPI_UNAVAILABLE')
    expect(body.diagnostics).toMatchObject({
      kind: 'upstream',
      httpStatus: 400,
      upstreamCode: 'INVALID_ASSET_URL',
      upstreamMessage: 'asset URL is not accessible',
    })
  })

  it('includes diagnostic kind when a network error occurs', async () => {
    installAuthMocks()
    mockAuthenticated('user-a')
    assetClientMock.listGroups.mockRejectedValueOnce(
      new MobileCloudMaasOpenApiError('network', 'MOBILE_CLOUD_OPENAPI_NETWORK_FAILED'),
    )
    const mod = await import('@/app/api/asset-hub/mobile-cloud/route')
    const response = await mod.GET(buildMockRequest({
      path: '/api/asset-hub/mobile-cloud?resource=groups',
      method: 'GET',
    }), { params: Promise.resolve({}) })
    expect(response.status).toBe(503)
    const body = await response.json()
    expect(body.error.code).toBe('MOBILE_CLOUD_OPENAPI_UNAVAILABLE')
    expect(body.diagnostics).toMatchObject({ kind: 'network' })
    expect(body.diagnostics.upstreamCode).toBeUndefined()
  })
})
