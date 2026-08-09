import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'
import {
  installAuthMocks,
  mockAuthenticated,
  mockUnauthenticated,
  resetAuthMockState,
} from '../../../helpers/auth'

const assetClientMock = vi.hoisted(() => ({
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
}))

vi.mock('@/lib/mobile-cloud-maas/asset-client', () => ({
  mobileCloudMaasAssetClient: assetClientMock,
  MobileCloudMaasOpenApiError: class MobileCloudMaasOpenApiError extends Error {},
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
})
