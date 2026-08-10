import { describe, expect, it, vi } from 'vitest'
import { createMobileCloudMaasAssetClient } from '@/lib/mobile-cloud-maas/asset-client'

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

const env = {
  MOBILE_CLOUD_MAAS_ACCESS_KEY: 'ak-demo',
  MOBILE_CLOUD_MAAS_SECRET_KEY: 'sk-demo',
  MOBILE_CLOUD_MAAS_BASE_URL: 'https://ecloud.example.test',
  MOBILE_CLOUD_MAAS_POOL_ID: 'CIDC-CORE-00',
}

describe('Mobile Cloud asset API client', () => {
  it('signs requests and maps the documented group page body', async () => {
    const fetchImpl = vi.fn(async () => response({
      requestId: 'req-1',
      state: 'OK',
      body: {
        total: 1,
        data: [{ groupId: 'g-1', groupType: 'AIGC', groupName: 'Virtual', description: 'demo' }],
      },
    }))
    const client = createMobileCloudMaasAssetClient({
      env,
      fetchImpl,
      now: () => Date.parse('2026-08-09T00:00:00.000Z'),
      nonce: () => 'nonce-demo',
    })

    const result = await client.listGroups({ groupType: 'AIGC' })
    expect(result.items).toEqual([{ groupId: 'g-1', groupType: 'AIGC', groupName: 'Virtual', description: 'demo' }])
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain('/api/openapi-maas/exp/aicc/v2/asset-group/query')
    expect(url).toContain('AccessKey=ak-demo')
    expect(url).toContain('SignatureNonce=nonce-demo')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['Pool-Id']).toBe('CIDC-CORE-00')
    expect(JSON.parse(String(init.body))).toEqual({ pageNo: 1, pageSize: 50, groupType: 'AIGC' })
  })

  it('rejects missing direct API credentials without making a request', async () => {
    const fetchImpl = vi.fn()
    const client = createMobileCloudMaasAssetClient({ env: {}, fetchImpl })
    await expect(client.listAssets()).rejects.toMatchObject({
      kind: 'config',
      missing: ['MOBILE_CLOUD_MAAS_ACCESS_KEY', 'MOBILE_CLOUD_MAAS_SECRET_KEY'],
    })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('turns upstream auth and envelope failures into typed errors', async () => {
    const authClient = createMobileCloudMaasAssetClient({ env, fetchImpl: vi.fn(async () => response({}, 403)) })
    await expect(authClient.listAssets()).rejects.toMatchObject({ kind: 'auth', status: 403 })

    const failedClient = createMobileCloudMaasAssetClient({
      env,
      fetchImpl: vi.fn(async () => response({ state: 'FAILED', errorCode: 'BAD_REQUEST', errorMessage: 'bad input' })),
    })
    await expect(failedClient.listAssets()).rejects.toMatchObject({ kind: 'upstream', upstreamCode: 'BAD_REQUEST' })
  })

  it('preserves a documented business error returned with HTTP 400', async () => {
    const client = createMobileCloudMaasAssetClient({
      env,
      fetchImpl: vi.fn(async () => response({
        state: 'ERROR',
        errorCode: 'C400999',
        errorMessage: '需要主账号才能进行此操作',
        body: null,
      }, 400)),
    })

    await expect(client.queryDeductions({
      beginTime: '2026-07-16 06:00:00',
      endTime: '2026-08-10 17:00:00',
    })).rejects.toMatchObject({
      kind: 'upstream',
      status: 400,
      upstreamCode: 'C400999',
      message: '需要主账号才能进行此操作',
    })
  })

  it('maps the documented string bodies for asset creation and real-person group lookup', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response({ state: 'OK', body: 'asset-1' }))
      .mockResolvedValueOnce(response({ state: 'OK', body: 'group-real-1' }))
    const client = createMobileCloudMaasAssetClient({ env, fetchImpl, nonce: () => 'nonce-demo' })
    await expect(client.createAsset({ groupId: 'group-1', assetName: 'face', assetUrl: 'https://cdn.example/face.png', assetType: 'Image' })).resolves.toEqual({ assetId: 'asset-1' })
    await expect(client.findGroupByBytedToken('token-1')).resolves.toEqual({ groupId: 'group-real-1' })
  })

  it('sends the documented export-task entry parameters and maps task status', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response({ state: 'OK', body: { taskId: 'export-1' } }))
      .mockResolvedValueOnce(response({ state: 'OK', body: { taskId: 'export-1', status: 'SUCCESS', totalRows: 2, downloadUrl: 'https://download.example/export.xlsx' } }))
    const client = createMobileCloudMaasAssetClient({ env, fetchImpl, nonce: () => 'nonce-demo' })
    await expect(client.createDeductionExportTask({ apiKey: 'key-name', ramName: 'ram-a', beginTime: '2026-07-12 06:00:00', endTime: '2026-07-12 17:00:00' })).resolves.toEqual({ taskId: 'export-1' })
    await expect(client.getDeductionExportTask('export-1')).resolves.toMatchObject({ status: 'SUCCESS', totalRows: 2, downloadUrl: 'https://download.example/export.xlsx' })
    expect(JSON.parse(String((fetchImpl.mock.calls[0][1] as RequestInit).body))).toEqual({
      modelName: 'AICC-Doubao-Seedance-2.0', apiKey: 'key-name', ramName: 'ram-a',
      beginTime: '2026-07-12 06:00:00', endTime: '2026-07-12 17:00:00',
    })
    expect(String(fetchImpl.mock.calls[1][0])).toContain('/api/openapi-maas/model/aicc/deduction/export-task/export-1')
  })
})
