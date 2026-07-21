import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

const state = vi.hoisted(() => ({ authenticated: true, admin: false }))
const queryUsage = vi.hoisted(() => vi.fn())

vi.mock('@/lib/api-auth', () => ({
  isErrorResponse: (value: unknown) => value instanceof Response,
  requireUserAuth: async () => state.authenticated
    ? { session: { user: { id: 'user-1' } } }
    : new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED' } }), { status: 401 }),
}))

vi.mock('@/lib/platform-admin', () => ({
  checkPlatformAdmin: async () => ({ isAdmin: state.admin, user: { id: 'user-1' } }),
}))

vi.mock('@/lib/mobile-cloud-maas/client', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/mobile-cloud-maas/client')>()
  return {
    ...actual,
    mobileCloudMaasUsageService: { query: queryUsage },
  }
})

describe('api contract - mobile cloud usage route', () => {
  const context = { params: Promise.resolve({}) }

  beforeEach(() => {
    vi.clearAllMocks()
    state.authenticated = true
    state.admin = false
    queryUsage.mockResolvedValue({ rows: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 1 } })
  })

  it('requires authentication', async () => {
    state.authenticated = false
    const { GET } = await import('@/app/api/user/mobile-cloud-usage/route')
    const response = await GET(buildMockRequest({
      path: '/api/user/mobile-cloud-usage?beginDate=2026-07-01&endDate=2026-07-20', method: 'GET',
    }), context)
    expect(response.status).toBe(401)
    expect(queryUsage).not.toHaveBeenCalled()
  })

  it('validates the date range and page size', async () => {
    const { GET } = await import('@/app/api/user/mobile-cloud-usage/route')
    const reversed = await GET(buildMockRequest({
      path: '/api/user/mobile-cloud-usage?beginDate=2026-07-20&endDate=2026-07-01', method: 'GET',
    }), context)
    const tooLong = await GET(buildMockRequest({
      path: '/api/user/mobile-cloud-usage?beginDate=2025-01-01&endDate=2026-07-20', method: 'GET',
    }), context)
    const pageSize = await GET(buildMockRequest({
      path: '/api/user/mobile-cloud-usage?beginDate=2026-07-01&endDate=2026-07-20&pageSize=100', method: 'GET',
    }), context)
    expect([reversed.status, tooLong.status, pageSize.status]).toEqual([400, 400, 400])
    expect(queryUsage).not.toHaveBeenCalled()
  })

  it('passes a normalized query to the shared service', async () => {
    const { GET } = await import('@/app/api/user/mobile-cloud-usage/route')
    const response = await GET(buildMockRequest({
      path: '/api/user/mobile-cloud-usage?beginDate=2026-07-01&endDate=2026-07-20&inferenceName=%20Seedance%20&page=2&pageSize=10',
      method: 'GET',
    }), context)
    expect(response.status).toBe(200)
    expect(queryUsage).toHaveBeenCalledWith({
      beginDate: '2026-07-01', endDate: '2026-07-20', inferenceName: 'Seedance', page: 2, pageSize: 10,
    })
  })

  it('only exposes missing environment names to platform admins', async () => {
    const { MobileCloudMaasError } = await import('@/lib/mobile-cloud-maas/client')
    queryUsage.mockRejectedValue(new MobileCloudMaasError(
      'config', 'MOBILE_CLOUD_CONFIG_MISSING', undefined, ['MOBILE_CLOUD_MAAS_COOKIE'],
    ))
    const { GET } = await import('@/app/api/user/mobile-cloud-usage/route')
    const request = () => buildMockRequest({
      path: '/api/user/mobile-cloud-usage?beginDate=2026-07-01&endDate=2026-07-20', method: 'GET',
    })
    const normalResponse = await GET(request(), context)
    state.admin = true
    const adminResponse = await GET(request(), context)
    const normalBody = await normalResponse.json()
    const adminBody = await adminResponse.json()
    expect(normalResponse.status).toBe(503)
    expect(JSON.stringify(normalBody)).not.toContain('MOBILE_CLOUD_MAAS_COOKIE')
    expect(adminBody.diagnostics.missing).toEqual(['MOBILE_CLOUD_MAAS_COOKIE'])
  })
})
