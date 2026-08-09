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
  it('signs requests, sends the documented pool header, and maps group pages', async () => {
    const fetchImpl = vi.fn(async () => response({
      requestId: 'req-1',
      state: 'OK',
      body: {
        pageNo: 1,
        pageSize: 50,
        totalSize: 1,
        dataRows: [{ groupId: 'g-1', groupType: 'AIGC', groupName: 'Virtual', description: 'demo' }],
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
    expect((init.headers as Record<string, string>)['pool-id']).toBe('CIDC-CORE-00')
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
})
