import { readMobileCloudMaasConfig, type MobileCloudMaasConfig } from './config'
import {
  buildPackageSummary,
  buildUsageTrend,
  deduplicateUsageRows,
  paginateUsageRows,
  splitDateRange,
} from './usage'
import type {
  MobileCloudPackageRow,
  MobileCloudUsageData,
  MobileCloudUsageQuery,
  MobileCloudUsageRow,
  MobileCloudUpstreamList,
} from './types'

type ErrorKind = 'auth' | 'config' | 'network' | 'upstream' | 'invalid-response'

export class MobileCloudMaasError extends Error {
  constructor(
    public readonly kind: ErrorKind,
    message: string,
    public readonly status?: number,
    public readonly missing: string[] = [],
  ) {
    super(message)
    this.name = 'MobileCloudMaasError'
  }
}

interface AggregateResult {
  package: MobileCloudUsageData['package']
  rows: MobileCloudUsageRow[]
  trend: MobileCloudUsageData['trend']
  fetchedAt: string
}

interface CacheEntry {
  value: AggregateResult
  createdAt: number
}

interface ServiceOptions {
  env?: Record<string, string | undefined>
  fetchImpl?: typeof fetch
  now?: () => number
  freshTtlMs?: number
  staleTtlMs?: number
  timeoutMs?: number
  maxCacheEntries?: number
}

function finiteNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(parsed) ? parsed : fallback
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = finiteNumber(value, Number.NaN)
  return Number.isFinite(parsed) ? parsed : null
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function listPayload(value: unknown): MobileCloudUpstreamList<Record<string, unknown>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new MobileCloudMaasError('invalid-response', 'MOBILE_CLOUD_RESPONSE_INVALID')
  }
  const record = value as Record<string, unknown>
  if (!Array.isArray(record.dataRows)) {
    throw new MobileCloudMaasError('invalid-response', 'MOBILE_CLOUD_RESPONSE_INVALID')
  }
  return {
    totalSize: Math.max(0, Math.floor(finiteNumber(record.totalSize, record.dataRows.length))),
    dataRows: record.dataRows.filter((row): row is Record<string, unknown> => (
      Boolean(row) && typeof row === 'object' && !Array.isArray(row)
    )),
  }
}

function normalizePackageRow(row: Record<string, unknown>): MobileCloudPackageRow {
  return {
    instanceId: stringValue(row.instanceId),
    poolId: stringValue(row.poolId),
    poolName: stringValue(row.poolName),
    chaGroupName: stringValue(row.chaGroupName),
    resourceStatus: stringValue(row.resourceStatus),
    productOrderNum: finiteNumber(row.productOrderNum),
    effectTime: stringValue(row.effectTime),
    expireTime: stringValue(row.expireTime),
    totalResourcePoint: nullableNumber(row.totalResourcePoint),
    remainingResourcePoint: nullableNumber(row.remainingResourcePoint),
  }
}

function normalizeUsageRow(row: Record<string, unknown>): MobileCloudUsageRow | null {
  const useTime = stringValue(row.useTime)
  const inferenceId = stringValue(row.inferenceId)
  if (!useTime || !inferenceId) return null
  return {
    promptTokens: finiteNumber(row.promptTokens),
    completionTokens: finiteNumber(row.completionTokens),
    totalTokens: finiteNumber(row.totalTokens),
    useTime,
    inferenceId,
    inferenceName: stringValue(row.inferenceName),
    domainType: stringValue(row.domainType) || null,
    promptUsageAmount: finiteNumber(row.promptUsageAmount),
    completionUsageAmount: finiteNumber(row.completionUsageAmount),
    totalUsageAmount: finiteNumber(row.totalUsageAmount),
  }
}

function cacheKey(query: MobileCloudUsageQuery): string {
  return JSON.stringify([query.beginDate, query.endDate, query.inferenceName])
}

export function createMobileCloudMaasUsageService(options: ServiceOptions = {}) {
  const fetchImpl = options.fetchImpl ?? fetch
  const now = options.now ?? Date.now
  const freshTtlMs = options.freshTtlMs ?? 3 * 60 * 1000
  const staleTtlMs = options.staleTtlMs ?? 30 * 60 * 1000
  const timeoutMs = options.timeoutMs ?? 12_000
  const maxCacheEntries = Math.max(1, Math.floor(options.maxCacheEntries ?? 100))
  const cache = new Map<string, CacheEntry>()
  const inFlight = new Map<string, Promise<AggregateResult>>()

  function storeCache(key: string, value: AggregateResult) {
    cache.delete(key)
    cache.set(key, { value, createdAt: now() })
    while (cache.size > maxCacheEntries) {
      const oldestKey = cache.keys().next().value
      if (typeof oldestKey !== 'string') break
      cache.delete(oldestKey)
    }
  }

  function requireConfig(): MobileCloudMaasConfig {
    const result = readMobileCloudMaasConfig(options.env ?? process.env)
    if (!result.configured) {
      throw new MobileCloudMaasError('config', 'MOBILE_CLOUD_CONFIG_MISSING', undefined, result.missing)
    }
    return result.config
  }

  async function requestJson(config: MobileCloudMaasConfig, path: string, body: unknown): Promise<unknown> {
    const url = `${config.baseUrl}${path}`
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const response = await fetchImpl(url, {
          method: 'POST',
          headers: {
            Accept: 'application/json, text/plain, */*',
            'Content-Type': 'application/json',
            Cookie: config.cookie,
            Origin: new URL(config.baseUrl).origin,
            'X-Requested-With': 'XMLHttpRequest',
            pool_id: config.poolId,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
          cache: 'no-store',
        })
        if (response.status === 401 || response.status === 403) {
          throw new MobileCloudMaasError('auth', 'MOBILE_CLOUD_SESSION_EXPIRED', response.status)
        }
        if (!response.ok) {
          if (response.status >= 500 && attempt < 2) continue
          throw new MobileCloudMaasError('upstream', 'MOBILE_CLOUD_UPSTREAM_FAILED', response.status)
        }
        try {
          return await response.json()
        } catch {
          throw new MobileCloudMaasError('invalid-response', 'MOBILE_CLOUD_RESPONSE_INVALID', response.status)
        }
      } catch (error) {
        if (error instanceof MobileCloudMaasError) throw error
        if (attempt >= 2) {
          throw new MobileCloudMaasError('network', 'MOBILE_CLOUD_NETWORK_FAILED')
        }
      } finally {
        clearTimeout(timeout)
      }
    }
    throw new MobileCloudMaasError('network', 'MOBILE_CLOUD_NETWORK_FAILED')
  }

  async function fetchPackage(config: MobileCloudMaasConfig): Promise<MobileCloudPackageRow> {
    const payload = listPayload(await requestJson(config, '/api/web/maas/console/studio/query', {
      startTime: '',
      endTime: '',
      pageNo: 1,
      pageSize: 100,
      instanceId: config.instanceId,
      chaGroupTypes: ['2', '7'],
      feeType: 'ONCE',
      sortParams: [{ fieldName: '', sortOrder: 'ASC' }],
    }))
    const packages = payload.dataRows.map(normalizePackageRow)
    const selected = packages.find((row) => row.instanceId === config.instanceId)
    if (!selected) throw new MobileCloudMaasError('upstream', 'MOBILE_CLOUD_PACKAGE_NOT_FOUND', 404)
    return selected
  }

  async function fetchUsageChunk(
    config: MobileCloudMaasConfig,
    chunk: { beginDate: string; endDate: string },
    inferenceName: string,
  ): Promise<MobileCloudUsageRow[]> {
    const rows: MobileCloudUsageRow[] = []
    let pageNo = 1
    let totalPages = 1
    do {
      const payload = listPayload(await requestJson(
        config,
        `/api/web/maas/model/credit-usages/${encodeURIComponent(config.instanceId)}/query`,
        { pageNo, pageSize: 100, inferenceName, ...chunk },
      ))
      for (const rawRow of payload.dataRows) {
        const row = normalizeUsageRow(rawRow)
        if (row) rows.push(row)
      }
      totalPages = Math.max(1, Math.ceil(payload.totalSize / 100))
      pageNo += 1
    } while (pageNo <= totalPages)
    return rows
  }

  async function fetchAggregate(config: MobileCloudMaasConfig, query: MobileCloudUsageQuery): Promise<AggregateResult> {
    const packageRow = await fetchPackage(config)
    const rows: MobileCloudUsageRow[] = []
    for (const chunk of splitDateRange(query.beginDate, query.endDate)) {
      rows.push(...await fetchUsageChunk(config, chunk, query.inferenceName))
    }
    const normalizedRows = deduplicateUsageRows(rows)
    return {
      package: buildPackageSummary(packageRow, config.packageTokensPerUnit),
      rows: normalizedRows,
      trend: buildUsageTrend(normalizedRows),
      fetchedAt: new Date(now()).toISOString(),
    }
  }

  function toPage(
    aggregate: AggregateResult,
    query: MobileCloudUsageQuery,
    cached: boolean,
    stale: boolean,
  ): MobileCloudUsageData {
    const page = paginateUsageRows(aggregate.rows, query.page, query.pageSize)
    return {
      package: aggregate.package,
      trend: aggregate.trend,
      rows: page.rows,
      pagination: page.pagination,
      query,
      fetchedAt: aggregate.fetchedAt,
      cached,
      stale,
    }
  }

  return {
    async query(query: MobileCloudUsageQuery): Promise<MobileCloudUsageData> {
      const config = requireConfig()
      const key = cacheKey(query)
      const existing = cache.get(key)
      const age = existing ? now() - existing.createdAt : Number.POSITIVE_INFINITY
      if (existing && age <= freshTtlMs) return toPage(existing.value, query, true, false)

      let pending = inFlight.get(key)
      if (!pending) {
        pending = fetchAggregate(config, query)
        inFlight.set(key, pending)
      }
      try {
        const aggregate = await pending
        storeCache(key, aggregate)
        return toPage(aggregate, query, false, false)
      } catch (error) {
        if (
          existing
          && age <= staleTtlMs
          && error instanceof MobileCloudMaasError
          && error.kind !== 'auth'
          && error.kind !== 'config'
        ) {
          return toPage(existing.value, query, true, true)
        }
        throw error
      } finally {
        if (inFlight.get(key) === pending) inFlight.delete(key)
      }
    },
  }
}

export const mobileCloudMaasUsageService = createMobileCloudMaasUsageService()
