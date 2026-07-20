import { describe, expect, it, vi } from 'vitest'
import { readMobileCloudMaasConfig } from '@/lib/mobile-cloud-maas/config'
import {
  createMobileCloudMaasUsageService,
} from '@/lib/mobile-cloud-maas/client'

const env = {
  MOBILE_CLOUD_MAAS_COOKIE: 'CMECLOUDTOKEN=secret',
  MOBILE_CLOUD_MAAS_INSTANCE_ID: 'MAAS-1',
  MOBILE_CLOUD_MAAS_POOL_ID: 'CIDC-RP-48',
  MOBILE_CLOUD_MAAS_PACKAGE_TOKENS_PER_UNIT: '7000000',
  MOBILE_CLOUD_MAAS_BASE_URL: 'https://ecloud.example',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const packageRow = {
  instanceId: 'MAAS-1',
  poolId: 'CIDC-RP-48',
  poolName: '华北-呼和浩特',
  chaGroupName: 'AICC-doubao-seedance-2.0-700万tokens',
  resourceStatus: 'ONCE_USING',
  productOrderNum: 12,
  effectTime: '2026-07-06 19:11:02',
  expireTime: '2026-10-04 19:11:02',
  totalResourcePoint: null,
  remainingResourcePoint: 82482699.72,
}

const usageRow = {
  promptTokens: 0,
  completionTokens: 216900,
  totalTokens: 216900,
  useTime: '2026-07-14 15:00:00',
  inferenceId: 'inf-1',
  inferenceName: 'AICC-doubao-seedance-2.0',
  domainType: 'VISION',
  promptUsageAmount: 0,
  completionUsageAmount: 356345.01,
  totalUsageAmount: 356345.01,
}

describe('mobile cloud MaaS config', () => {
  it('reports missing server-only fields without accepting an invalid token count', () => {
    expect(readMobileCloudMaasConfig({ MOBILE_CLOUD_MAAS_PACKAGE_TOKENS_PER_UNIT: '-1' })).toEqual({
      configured: false,
      missing: [
        'MOBILE_CLOUD_MAAS_COOKIE',
        'MOBILE_CLOUD_MAAS_INSTANCE_ID',
        'MOBILE_CLOUD_MAAS_POOL_ID',
        'MOBILE_CLOUD_MAAS_PACKAGE_TOKENS_PER_UNIT',
      ],
    })
  })
})

describe('mobile cloud MaaS client', () => {
  it('sends secure console requests, walks upstream pages and returns normalized data', async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      const headers = new Headers(init?.headers)
      expect(headers.get('Cookie')).toBe('CMECLOUDTOKEN=secret')
      expect(headers.get('pool_id')).toBe('CIDC-RP-48')
      if (url.endsWith('/console/studio/query')) {
        return jsonResponse({ totalSize: 1, dataRows: [packageRow] })
      }
      const body = JSON.parse(String(init?.body)) as { pageNo: number; pageSize: number }
      expect(body.pageSize).toBe(100)
      if (body.pageNo === 1) return jsonResponse({ totalSize: 101, dataRows: [usageRow] })
      return jsonResponse({ totalSize: 101, dataRows: [{ ...usageRow, useTime: '2026-07-13 12:00:00' }] })
    })
    const service = createMobileCloudMaasUsageService({ env, fetchImpl })

    const result = await service.query({
      beginDate: '2026-07-01', endDate: '2026-07-20', inferenceName: '', page: 1, pageSize: 20,
    })

    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(result.package.totalTokens).toBe(84_000_000)
    expect(result.rows).toHaveLength(2)
    expect(result.pagination.total).toBe(2)
    expect(result.cached).toBe(false)
  })

  it('splits ranges over 30 days and caches identical aggregate queries', async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      if (String(input).endsWith('/console/studio/query')) {
        return jsonResponse({ totalSize: 1, dataRows: [packageRow] })
      }
      return jsonResponse({ totalSize: 0, dataRows: [] })
    })
    const service = createMobileCloudMaasUsageService({ env, fetchImpl })
    const query = { beginDate: '2026-05-01', endDate: '2026-07-01', inferenceName: '', page: 1, pageSize: 20 }

    await service.query(query)
    const cached = await service.query({ ...query, page: 2 })

    expect(fetchImpl).toHaveBeenCalledTimes(4)
    expect(cached.cached).toBe(true)
  })

  it('retries transient failures and serves a recent stale result', async () => {
    let now = Date.parse('2026-07-20T00:00:00Z')
    let fail = false
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      if (fail) return jsonResponse({ message: 'unavailable' }, 503)
      if (String(input).endsWith('/console/studio/query')) {
        return jsonResponse({ totalSize: 1, dataRows: [packageRow] })
      }
      return jsonResponse({ totalSize: 1, dataRows: [usageRow] })
    })
    const service = createMobileCloudMaasUsageService({ env, fetchImpl, now: () => now })
    const query = { beginDate: '2026-07-01', endDate: '2026-07-20', inferenceName: '', page: 1, pageSize: 20 }
    await service.query(query)
    now += 4 * 60 * 1000
    fail = true

    const stale = await service.query(query)

    expect(stale.stale).toBe(true)
    expect(stale.cached).toBe(true)
    expect(fetchImpl).toHaveBeenCalledTimes(5)
  })

  it('does not retry or hide an expired console session', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ message: 'unauthorized' }, 401))
    const service = createMobileCloudMaasUsageService({ env, fetchImpl })

    await expect(service.query({
      beginDate: '2026-07-01', endDate: '2026-07-20', inferenceName: '', page: 1, pageSize: 20,
    })).rejects.toMatchObject({ kind: 'auth', status: 401 })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('evicts the oldest aggregate when the cache reaches its bound', async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      if (String(input).endsWith('/console/studio/query')) {
        return jsonResponse({ totalSize: 1, dataRows: [packageRow] })
      }
      return jsonResponse({ totalSize: 0, dataRows: [] })
    })
    const service = createMobileCloudMaasUsageService({ env, fetchImpl, maxCacheEntries: 1 })
    const base = { endDate: '2026-07-20', inferenceName: '', page: 1, pageSize: 20 }
    await service.query({ ...base, beginDate: '2026-07-01' })
    await service.query({ ...base, beginDate: '2026-07-02' })
    await service.query({ ...base, beginDate: '2026-07-01' })
    expect(fetchImpl).toHaveBeenCalledTimes(6)
  })
})
