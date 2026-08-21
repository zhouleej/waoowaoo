import {
  buildMobileCloudSignature,
  type MobileCloudSignatureMethod,
} from './signature'
import {
  readMobileCloudMaasOpenApiConfig,
  type MobileCloudMaasOpenApiConfig,
} from './openapi-config'
import type {
  MobileCloudAsset,
  MobileCloudAssetGroup,
  MobileCloudAssetGroupType,
  MobileCloudAssetStatus,
  MobileCloudAssetType,
  MobileCloudDeductionRow,
  MobileCloudExportTask,
  MobileCloudPage,
  MobileCloudRealPersonSession,
} from './asset-types'
import { MOBILE_CLOUD_DEDUCTION_MODEL } from './asset-types'

export type MobileCloudMaasOpenApiErrorKind = 'config' | 'auth' | 'network' | 'upstream' | 'invalid-response'

export class MobileCloudMaasOpenApiError extends Error {
  constructor(
    public readonly kind: MobileCloudMaasOpenApiErrorKind,
    message: string,
    public readonly status?: number,
    public readonly missing: string[] = [],
    public readonly upstreamCode?: string,
  ) {
    super(message)
    this.name = 'MobileCloudMaasOpenApiError'
  }
}

interface Envelope<T> {
  requestId: string
  state: string
  errorCode?: string | null
  errorMessage?: string | null
  body: T
}

interface AssetClientOptions {
  env?: Record<string, string | undefined>
  fetchImpl?: typeof fetch
  now?: () => number
  nonce?: () => string
  timeoutMs?: number
  signatureMethod?: MobileCloudSignatureMethod
}

interface RequestOptions {
  query?: Record<string, string | number | boolean | null | undefined>
  body?: unknown
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new MobileCloudMaasOpenApiError('invalid-response', 'MOBILE_CLOUD_ASSET_RESPONSE_INVALID')
  }
  return value as Record<string, unknown>
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function number(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function page<T>(body: unknown, mapper: (value: Record<string, unknown>) => T): MobileCloudPage<T> {
  const record = asRecord(body)
  const rows = Array.isArray(record.data)
    ? record.data
    : Array.isArray(record.dataRows)
      ? record.dataRows
    : Array.isArray(record.items)
      ? record.items
      : null
  if (!rows) throw new MobileCloudMaasOpenApiError('invalid-response', 'MOBILE_CLOUD_ASSET_RESPONSE_INVALID')
  return {
    pageNo: Math.max(1, Math.floor(number(record.pageNo, 1))),
    pageSize: Math.max(1, Math.floor(number(record.pageSize, rows.length || 1))),
    total: Math.max(0, Math.floor(number(record.total, number(record.totalSize, rows.length)))),
    items: rows.map((item) => mapper(asRecord(item))),
  }
}

function mapGroup(row: Record<string, unknown>): MobileCloudAssetGroup {
  return {
    groupId: text(row.groupId),
    groupType: text(row.groupType) as MobileCloudAssetGroupType,
    groupName: text(row.groupName),
    description: text(row.description),
    assetCount: row.assetCount === undefined ? undefined : number(row.assetCount),
    createTime: text(row.createdTime) || text(row.createTime) || undefined,
    updateTime: text(row.updatedTime) || text(row.updateTime) || undefined,
  }
}

function mapAsset(row: Record<string, unknown>): MobileCloudAsset {
  return {
    assetId: text(row.assetId),
    groupId: text(row.groupId),
    assetName: text(row.assetName),
    assetType: text(row.assetType) as MobileCloudAssetType,
    assetUrl: text(row.assetUrl),
    status: text(row.status) as MobileCloudAssetStatus,
    errorMessage: text(row.errorMessage) || undefined,
    createTime: text(row.createdTime) || text(row.createTime) || undefined,
    updateTime: text(row.updatedTime) || text(row.updateTime) || undefined,
  }
}

function mapDeduction(row: Record<string, unknown>): MobileCloudDeductionRow {
  return {
    taskId: text(row.taskId),
    userName: text(row.userName),
    inputTokens: number(row.inputTokens),
    outputTokens: number(row.outputTokens),
    totalTokens: number(row.totalTokens),
    videoInputTokens: number(row.videoInputTokens),
    noVideoInputTokens: number(row.noVideoInputTokens),
    videoInput1080pTokens: number(row.videoInput1080pTokens),
    noVideoInput1080pTokens: number(row.noVideoInput1080pTokens),
    costAmount: number(row.costAmount),
    deductTime: text(row.deductTime),
  }
}

function trimId(value: string, field: string): string {
  const normalized = value.trim()
  if (!normalized || normalized.length > 200) throw new MobileCloudMaasOpenApiError('upstream', `${field}_INVALID`, 400)
  return normalized
}

export function createMobileCloudMaasAssetClient(options: AssetClientOptions = {}) {
  const fetchImpl = options.fetchImpl ?? fetch
  const now = options.now ?? Date.now
  const nonce = options.nonce ?? (() => crypto.randomUUID())
  const timeoutMs = options.timeoutMs ?? 15_000

  function requireConfig(): MobileCloudMaasOpenApiConfig {
    const result = readMobileCloudMaasOpenApiConfig(options.env ?? process.env)
    if (!result.configured) {
      throw new MobileCloudMaasOpenApiError('config', 'MOBILE_CLOUD_OPENAPI_CONFIG_MISSING', undefined, result.missing)
    }
    return result.config
  }

  async function request<T>(method: string, path: string, requestOptions: RequestOptions = {}): Promise<T> {
    const config = requireConfig()
    const signed = buildMobileCloudSignature({
      accessKey: config.accessKey,
      secretKey: config.secretKey,
      method,
      servletPath: path,
      query: requestOptions.query,
      signatureMethod: options.signatureMethod,
      now: now(),
      nonce: nonce(),
    })
    const url = new URL(`${config.baseUrl}${path}`)
    for (const [key, value] of Object.entries(signed.params)) url.searchParams.set(key, value)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetchImpl(url.toString(), {
        method,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          // Keep parity with ecloudsdkmaas Config(pool_id=...). The pool is
          // transport metadata, not part of the deduction request body.
          'Pool-Id': config.poolId,
        },
        ...(requestOptions.body === undefined ? {} : { body: JSON.stringify(requestOptions.body) }),
        signal: controller.signal,
        cache: 'no-store',
      })
      if (response.status === 401 || response.status === 403) {
        throw new MobileCloudMaasOpenApiError('auth', 'MOBILE_CLOUD_OPENAPI_AUTH_FAILED', response.status)
      }
      let payload: unknown
      try {
        payload = await response.json()
      } catch {
        if (!response.ok) {
          throw new MobileCloudMaasOpenApiError('upstream', 'MOBILE_CLOUD_OPENAPI_FAILED', response.status)
        }
        throw new MobileCloudMaasOpenApiError('invalid-response', 'MOBILE_CLOUD_ASSET_RESPONSE_INVALID', response.status)
      }
      const envelope = asRecord(payload) as unknown as Envelope<T>
      if (text(envelope.state) !== 'OK') {
        throw new MobileCloudMaasOpenApiError(
          'upstream',
          text(envelope.errorMessage) || 'MOBILE_CLOUD_OPENAPI_FAILED',
          response.status,
          [],
          text(envelope.errorCode) || undefined,
        )
      }
      if (!response.ok) throw new MobileCloudMaasOpenApiError('upstream', 'MOBILE_CLOUD_OPENAPI_FAILED', response.status)
      if (!('body' in envelope)) throw new MobileCloudMaasOpenApiError('invalid-response', 'MOBILE_CLOUD_ASSET_RESPONSE_INVALID', response.status)
      return envelope.body
    } catch (error) {
      if (error instanceof MobileCloudMaasOpenApiError) throw error
      throw new MobileCloudMaasOpenApiError('network', 'MOBILE_CLOUD_OPENAPI_NETWORK_FAILED')
    } finally {
      clearTimeout(timeout)
    }
  }

  return {
    async listGroups(input: {
      pageNo?: number
      pageSize?: number
      groupType?: MobileCloudAssetGroupType
      groupName?: string
      groupIds?: string[]
    } = {}): Promise<MobileCloudPage<MobileCloudAssetGroup>> {
      const body = {
        pageNo: input.pageNo ?? 1,
        pageSize: input.pageSize ?? 50,
        ...(input.groupType ? { groupType: input.groupType } : {}),
        ...(input.groupName ? { groupName: input.groupName } : {}),
        ...(input.groupIds?.length ? { groupIds: input.groupIds } : {}),
      }
      return page(await request('POST', '/api/openapi-maas/exp/aicc/v2/asset-group/query', { body }), mapGroup)
    },
    async getGroup(groupId: string) {
      return mapGroup(asRecord(await request('GET', `/api/openapi-maas/exp/aicc/v2/asset-group/${encodeURIComponent(trimId(groupId, 'GROUP_ID'))}`)))
    },
    async createGroup(input: { groupType: 'AIGC'; groupName: string; description?: string }) {
      return mapGroup(asRecord(await request('POST', '/api/openapi-maas/exp/aicc/v2/asset-group', { body: input })))
    },
    async updateGroup(groupId: string, input: { groupName?: string; description?: string }) {
      return mapGroup(asRecord(await request('PUT', `/api/openapi-maas/exp/aicc/v2/asset-group/${encodeURIComponent(trimId(groupId, 'GROUP_ID'))}`, { body: input })))
    },
    async deleteGroup(groupId: string) {
      await request('DELETE', `/api/openapi-maas/exp/aicc/v2/asset-group/${encodeURIComponent(trimId(groupId, 'GROUP_ID'))}`)
    },
    async listAssets(input: {
      pageNo?: number
      pageSize?: number
      groupIds?: string[]
      groupType?: MobileCloudAssetGroupType
      assetName?: string
      statuses?: MobileCloudAssetStatus[]
    } = {}): Promise<MobileCloudPage<MobileCloudAsset>> {
      const body = {
        pageNo: input.pageNo ?? 1,
        pageSize: input.pageSize ?? 50,
        ...(input.groupIds?.length ? { groupIds: input.groupIds } : {}),
        ...(input.groupType ? { groupType: input.groupType } : {}),
        ...(input.assetName ? { assetName: input.assetName } : {}),
        ...(input.statuses?.length ? { statuses: input.statuses } : {}),
      }
      return page(await request('POST', '/api/openapi-maas/exp/aicc/v2/asset/query', { body }), mapAsset)
    },
    async getAsset(assetId: string) {
      return mapAsset(asRecord(await request('GET', `/api/openapi-maas/exp/aicc/v2/asset/${encodeURIComponent(trimId(assetId, 'ASSET_ID'))}`)))
    },
    async createAsset(input: { groupId: string; assetName: string; assetUrl: string; assetType: MobileCloudAssetType }) {
      const body = await request<unknown>('POST', '/api/openapi-maas/exp/aicc/v2/asset', { body: input })
      if (typeof body !== 'string' || !body.trim()) throw new MobileCloudMaasOpenApiError('invalid-response', 'MOBILE_CLOUD_ASSET_RESPONSE_INVALID')
      return { assetId: body.trim() }
    },
    async updateAsset(assetId: string, input: { assetName?: string }) {
      return mapAsset(asRecord(await request('PUT', `/api/openapi-maas/exp/aicc/v2/asset/${encodeURIComponent(trimId(assetId, 'ASSET_ID'))}`, { body: input })))
    },
    async deleteAsset(assetId: string) {
      await request('DELETE', `/api/openapi-maas/exp/aicc/v2/asset/${encodeURIComponent(trimId(assetId, 'ASSET_ID'))}`)
    },
    async createRealPersonAuthSession(): Promise<MobileCloudRealPersonSession> {
      const body = asRecord(await request('POST', '/api/openapi-maas/exp/aicc/v2/real-person-auth/sessions'))
      return { bytedToken: text(body.bytedToken), h5Link: text(body.h5Link), expiresIn: number(body.expiresIn) }
    },
    async findGroupByBytedToken(bytedToken: string) {
      const body = await request<unknown>('POST', '/api/openapi-maas/exp/aicc/v2/real-person-auth/asset-group/by-byted-token', { body: { bytedToken: trimId(bytedToken, 'BYTED_TOKEN') } })
      if (typeof body === 'string' && body.trim()) return { groupId: body.trim() }
      const record = asRecord(body)
      return { groupId: text(record.groupId) }
    },
    async queryDeductions(input: {
      pageNo?: number
      pageSize?: number
      apiKey?: string
      ramName?: string
      beginTime: string
      endTime: string
    }): Promise<MobileCloudPage<MobileCloudDeductionRow>> {
      const body = {
        pageNo: input.pageNo ?? 1,
        pageSize: input.pageSize ?? 50,
        modelName: MOBILE_CLOUD_DEDUCTION_MODEL,
        beginTime: input.beginTime,
        endTime: input.endTime,
        ...(input.apiKey ? { apiKey: input.apiKey } : {}),
        ...(input.ramName ? { ramName: input.ramName } : {}),
      }
      return page(await request('POST', '/api/openapi-maas/model/aicc/deduction', { body }), mapDeduction)
    },
    async createDeductionExportTask(input: { apiKey?: string; ramName?: string; beginTime: string; endTime: string }) {
      return asRecord(await request('POST', '/api/openapi-maas/model/aicc/deduction/export-task', {
        body: {
          modelName: MOBILE_CLOUD_DEDUCTION_MODEL,
          beginTime: input.beginTime,
          endTime: input.endTime,
          ...(input.apiKey ? { apiKey: input.apiKey } : {}),
          ...(input.ramName ? { ramName: input.ramName } : {}),
        },
      })) as unknown as { taskId: string }
    },
    async getDeductionExportTask(taskId: string): Promise<MobileCloudExportTask> {
      return asRecord(await request('GET', `/api/openapi-maas/model/aicc/deduction/export-task/${encodeURIComponent(trimId(taskId, 'TASK_ID'))}`)) as unknown as MobileCloudExportTask
    },
  }
}

export const mobileCloudMaasAssetClient = createMobileCloudMaasAssetClient()
