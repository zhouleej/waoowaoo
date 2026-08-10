import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

const state = vi.hoisted(() => ({ authenticated: true, admin: false }))
const queryUsage = vi.hoisted(() => vi.fn())
const exportTask = vi.hoisted(() => vi.fn())
const exportStatus = vi.hoisted(() => vi.fn())

vi.mock('@/lib/api-auth', () => ({
  isErrorResponse: (value: unknown) => value instanceof Response,
  requireUserAuth: async () => state.authenticated
    ? { session: { user: { id: 'user-1' } } }
    : new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED' } }), { status: 401 }),
}))

vi.mock('@/lib/platform-admin', () => ({
  checkPlatformAdmin: async () => ({ isAdmin: state.admin, user: { id: 'user-1' } }),
}))

vi.mock('@/lib/mobile-cloud-maas/usage-service', () => ({
  mobileCloudMaasUsageService: { query: queryUsage },
  countInclusiveDays: (begin: string, end: string) => {
    const beginTime = Date.parse(`${begin}T00:00:00Z`)
    const endTime = Date.parse(`${end}T00:00:00Z`)
    if (!Number.isFinite(beginTime) || !Number.isFinite(endTime) || beginTime > endTime) throw new Error('invalid')
    return Math.floor((endTime - beginTime) / (24 * 60 * 60 * 1000)) + 1
  },
  getCalendarDatePreset: () => ({ beginDate: '2026-07-01', endDate: '2026-07-20' }),
}))

vi.mock('@/lib/mobile-cloud-maas/asset-client', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/mobile-cloud-maas/asset-client')>()
  return {
    ...actual,
    mobileCloudMaasAssetClient: {
      createDeductionExportTask: exportTask,
      getDeductionExportTask: exportStatus,
    },
  }
})

describe('api contract - mobile cloud direct deduction route', () => {
  const context = { params: Promise.resolve({}) }

  beforeEach(() => {
    vi.clearAllMocks()
    state.authenticated = true
    state.admin = false
    queryUsage.mockResolvedValue({ modelName: 'AICC-Doubao-Seedance-2.0', summary: { totalTokens: 0, costAmount: 0, videoInputTokens: 0, noVideoInputTokens: 0, videoInput1080pTokens: 0, noVideoInput1080pTokens: 0 }, trend: [], rows: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 1 }, query: { beginDate: '2026-07-01', endDate: '2026-07-20', apiKey: '', ramName: '', page: 1, pageSize: 20 }, fetchedAt: '2026-07-20T00:00:00.000Z' })
  })

  it('requires authentication', async () => {
    state.authenticated = false
    const { GET } = await import('@/app/api/user/mobile-cloud-usage/route')
    const response = await GET(buildMockRequest({ path: '/api/user/mobile-cloud-usage?beginDate=2026-07-01&endDate=2026-07-20', method: 'GET' }), context)
    expect(response.status).toBe(401)
    expect(queryUsage).not.toHaveBeenCalled()
  })

  it('passes direct API Key and RAM filters to the usage service', async () => {
    const { GET } = await import('@/app/api/user/mobile-cloud-usage/route')
    const response = await GET(buildMockRequest({ path: '/api/user/mobile-cloud-usage?beginDate=2026-07-01&endDate=2026-07-20&apiKey=%20Seedance%20&ramName=ram-a&page=2&pageSize=10', method: 'GET' }), context)
    expect(response.status).toBe(200)
    expect(queryUsage).toHaveBeenCalledWith({ beginDate: '2026-07-01', endDate: '2026-07-20', apiKey: 'Seedance', ramName: 'ram-a', page: 2, pageSize: 10 })
  })

  it('splits export ranges and aggregates the official create/status endpoints', async () => {
    exportTask.mockImplementation(async ({ beginTime }: { beginTime: string }) => ({ taskId: `export-${beginTime}` }))
    exportStatus.mockImplementation(async (taskId: string) => ({ taskId, status: 'SUCCESS', totalRows: 1, downloadUrl: `https://download.example/${encodeURIComponent(taskId)}` }))
    const { POST: createExport } = await import('@/app/api/user/mobile-cloud-usage/export/route')
    const { POST: queryExport } = await import('@/app/api/user/mobile-cloud-usage/export/status/route')
    const postResponse = await createExport(buildMockRequest({ path: '/api/user/mobile-cloud-usage/export', method: 'POST', body: { beginDate: '2026-07-01', endDate: '2026-07-01', apiKey: 'key-a' } }), context)
    const created = await postResponse.json()
    const statusResponse = await queryExport(buildMockRequest({ path: '/api/user/mobile-cloud-usage/export/status', method: 'POST', body: { taskIds: created.data.taskIds, pendingWindows: created.data.pendingWindows } }), context)
    expect(postResponse.status).toBe(202)
    expect(exportTask).toHaveBeenCalledTimes(2)
    expect(exportTask).toHaveBeenNthCalledWith(1, expect.objectContaining({ beginTime: '2026-07-01 00:00:00', endTime: '2026-07-01 23:59:59', apiKey: 'key-a' }))
    expect(statusResponse.status).toBe(200)
    expect(await statusResponse.json()).toMatchObject({ success: true, data: { status: 'SUCCESS', totalRows: 2, downloadUrls: expect.any(Array) } })
  })

  it('shows the main-account requirement only to platform admins', async () => {
    state.admin = true
    const { MobileCloudMaasOpenApiError } = await import('@/lib/mobile-cloud-maas/asset-client')
    queryUsage.mockRejectedValue(new MobileCloudMaasOpenApiError(
      'upstream',
      '需要主账号才能进行此操作',
      400,
      [],
      'C400999',
    ))
    const { GET } = await import('@/app/api/user/mobile-cloud-usage/route')
    const response = await GET(buildMockRequest({ path: '/api/user/mobile-cloud-usage', method: 'GET' }), context)

    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({
      error: {
        code: 'MOBILE_CLOUD_OPENAPI_MAIN_ACCOUNT_REQUIRED',
        message: '资费明细仅支持移动云主账号，请配置主账号的 AK/SK',
      },
      diagnostics: {
        configured: true,
        action: 'USE_MOBILE_CLOUD_MAIN_ACCOUNT_ACCESS_KEY',
        upstreamCode: 'C400999',
      },
    })
  })
})
