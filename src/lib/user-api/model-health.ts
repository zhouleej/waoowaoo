import { createHash } from 'node:crypto'
import { getProviderConfig, getProviderKey, getUserModels, type CustomModel } from '@/lib/api-config'
import { prisma } from '@/lib/prisma'
import { safeOutboundFetch, SafeOutboundError } from '@/lib/security/safe-outbound-http'
import { discoverModels, ModelDiscoveryError } from '@/lib/user-api/model-discovery'

export type ModelHealth = 'unknown' | 'healthy' | 'degraded' | 'unhealthy'
export type ModelHealthCheckLevel = 'existence' | 'inference'
export type ModelHealthProtocol = 'responses' | 'chat-completions'

export interface ModelHealthResult {
  status: ModelHealth
  checkLevel: ModelHealthCheckLevel
  checkedAt: string
  latencyMs?: number
  errorCode?: string
  message?: string
  providerId: string
  modelKey: string
  modelId: string
  modelType: CustomModel['type']
  protocol?: ModelHealthProtocol
}

type DetectorContext = {
  userId: string
  model: CustomModel
  provider: Awaited<ReturnType<typeof getProviderConfig>>
}
type Detector = (context: DetectorContext) => Promise<Omit<ModelHealthResult, 'providerId' | 'modelKey' | 'modelId' | 'modelType' | 'checkedAt' | 'latencyMs'>>

const CHECK_TIMEOUT_MS = 15_000
const DEBOUNCE_MS = 5_000
const MAX_ERROR_BODY_BYTES = 64 * 1024
const inFlight = new Map<string, Promise<ModelHealthResult>>()
const recent = new Map<string, { expiresAt: number; result: ModelHealthResult }>()

function safeMessage(code: string): string {
  const messages: Record<string, string> = {
    INFERENCE_OK: 'Model inference succeeded',
    MODEL_DISCOVERED: 'Model discovered; paid media generation was not executed',
    MODEL_NOT_FOUND: 'Model was not found in the provider model list',
    DISCOVERY_UNSUPPORTED: 'Provider model listing is not supported; paid media generation was not executed',
    CHECK_UNSUPPORTED: 'Provider inference health check is not supported; no inference request was sent',
    AUTH_FAILED: 'Provider authentication failed',
    PROVIDER_BILLING_UNAVAILABLE: 'Provider billing or quota prevents model inference',
    MODEL_ACCESS_FORBIDDEN: 'Provider denied access to this model',
    ACCESS_FORBIDDEN: 'Provider denied the health check request',
    RATE_LIMITED: 'Provider rate limited the health check',
    TIMEOUT: 'Provider health check timed out',
    UPSTREAM_UNAVAILABLE: 'Provider is temporarily unavailable',
    NETWORK_ERROR: 'Provider network request failed',
    INVALID_RESPONSE: 'Provider returned an invalid response',
    PROTOCOL_UNSUPPORTED: 'The configured inference protocol is unsupported',
    SSRF_BLOCKED: 'Provider URL failed the outbound request safety policy',
  }
  return messages[code] ?? 'Model health check failed'
}

function result(code: string, status: ModelHealth, checkLevel: ModelHealthCheckLevel, protocol?: ModelHealthProtocol) {
  return { status, checkLevel, errorCode: code, message: safeMessage(code), ...(protocol ? { protocol } : {}) }
}

function errorRecord(error: unknown): Record<string, unknown> | null {
  return error && typeof error === 'object' ? error as Record<string, unknown> : null
}

function errorText(record: Record<string, unknown> | null, field: 'message' | 'type' | 'code'): string {
  const value = record?.[field]
  return typeof value === 'string' ? value.toLowerCase() : ''
}

function classifyInferenceError(error: unknown, protocol?: ModelHealthProtocol) {
  const record = errorRecord(error)
  const nested = errorRecord(record?.error)
  const status = Number(record?.status ?? record?.statusCode ?? nested?.status ?? nested?.statusCode)
  const code = `${errorText(record, 'code')} ${errorText(nested, 'code')}`
  const type = `${errorText(record, 'type')} ${errorText(nested, 'type')}`
  const message = `${errorText(record, 'message')} ${errorText(nested, 'message')}`
  const evidence = `${code} ${type} ${message}`
  const name = String(record?.name ?? '')
  const authFailure = /invalid[_ -]?api[_ -]?key|unauthori[sz]ed|authentication|credential/.test(evidence)
  const billingUnavailable = /billing (?:is )?disabled|payment required|insufficient (?:balance|credit|funds)|(?:balance|quota) (?:is )?(?:exhausted|depleted)|(?:exhausted|depleted) (?:balance|quota)|(?:redeem|upgrade)(?: (?:or|your))? (?:a )?plan|plan upgrade/.test(evidence)
  const modelAccessForbidden = /model(?: access)? (?:is )?(?:forbidden|denied|not allowed|restricted)|(?:access|permission) (?:to|for) (?:this |the )?model (?:is )?(?:forbidden|denied|not allowed|restricted)|not (?:allowed|authorized) to (?:access|use) (?:this |the )?model/.test(evidence)
  if (status === 401 || authFailure) return result('AUTH_FAILED', 'unhealthy', 'inference', protocol)
  if (status === 403 && billingUnavailable) return result('PROVIDER_BILLING_UNAVAILABLE', 'unhealthy', 'inference', protocol)
  if (status === 403 && modelAccessForbidden) return result('MODEL_ACCESS_FORBIDDEN', 'unhealthy', 'inference', protocol)
  if (status === 403) return result('ACCESS_FORBIDDEN', 'unhealthy', 'inference', protocol)
  if (status === 404 || code.includes('model_not_found') || message.includes('model not found')) return result('MODEL_NOT_FOUND', 'unhealthy', 'inference', protocol)
  if (status === 429 || code.includes('rate_limit')) return result('RATE_LIMITED', 'degraded', 'inference', protocol)
  if (name === 'AbortError' || name === 'TimeoutError' || code.includes('timeout') || message.includes('timeout')) return result('TIMEOUT', 'degraded', 'inference', protocol)
  if (status >= 500) return result('UPSTREAM_UNAVAILABLE', 'degraded', 'inference', protocol)
  if (message.includes('fetch') || message.includes('network') || message.includes('socket')) return result('NETWORK_ERROR', 'degraded', 'inference', protocol)
  if (status === 400 || status === 405 || status === 422 || status === 501) return result('PROTOCOL_UNSUPPORTED', 'unhealthy', 'inference', protocol)
  return result('INVALID_RESPONSE', 'unhealthy', 'inference', protocol)
}

async function readErrorDetails(response: Response): Promise<Record<string, unknown>> {
  const details: Record<string, unknown> = { status: response.status }
  const declaredLength = Number(response.headers.get('content-length') || '0')
  if (Number.isFinite(declaredLength) && declaredLength > MAX_ERROR_BODY_BYTES) return details
  const reader = response.body?.getReader()
  if (!reader) return details
  const chunks: Uint8Array[] = []
  let byteLength = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      byteLength += value.byteLength
      if (byteLength > MAX_ERROR_BODY_BYTES) {
        await reader.cancel().catch(() => undefined)
        return details
      }
      chunks.push(value)
    }
  } catch {
    return details
  }
  const bytes = new Uint8Array(byteLength)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    const parsed = errorRecord(JSON.parse(new TextDecoder().decode(bytes)))
    if (!parsed) return details
    const nested = errorRecord(parsed.error)
    for (const field of ['message', 'type', 'code'] as const) {
      if (typeof parsed[field] === 'string') details[field] = parsed[field]
      if (typeof nested?.[field] === 'string') {
        const target = errorRecord(details.error) ?? {}
        target[field] = nested[field]
        details.error = target
      }
    }
  } catch {
    // Non-JSON provider responses are intentionally discarded.
  }
  return details
}

const openAICompatibleLlmDetector: Detector = async ({ model, provider }) => {
  if (!provider.baseUrl) return result('PROTOCOL_UNSUPPORTED', 'unhealthy', 'inference', model.llmProtocol)
  const protocol = model.llmProtocol || 'chat-completions'
  let url: URL
  try {
    const base = new URL(provider.baseUrl)
    url = new URL(protocol === 'responses' ? 'responses' : 'chat/completions', `${base.toString().replace(/\/+$/, '')}/`)
  } catch {
    return result('SSRF_BLOCKED', 'unhealthy', 'inference', protocol)
  }
  const body = protocol === 'responses'
    ? { model: model.modelId, input: 'ping', max_output_tokens: 8, temperature: 0 }
    : { model: model.modelId, messages: [{ role: 'user', content: 'ping' }], max_tokens: 8, temperature: 0 }
  try {
    const response = await safeOutboundFetch(url, {
      method: 'POST',
      redirect: 'manual',
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
      headers: { Authorization: `Bearer ${provider.apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    })
    if (response.status >= 300 && response.status < 400) return result('SSRF_BLOCKED', 'unhealthy', 'inference', protocol)
    if (!response.ok) return classifyInferenceError(await readErrorDetails(response), protocol)
    const length = Number(response.headers.get('content-length') || '0')
    if (length > MAX_ERROR_BODY_BYTES) return result('INVALID_RESPONSE', 'unhealthy', 'inference', protocol)
    return { status: 'healthy', checkLevel: 'inference', protocol, message: safeMessage('INFERENCE_OK') }
  } catch (error) {
    if (error instanceof ModelDiscoveryError || error instanceof SafeOutboundError) return result('SSRF_BLOCKED', 'unhealthy', 'inference', protocol)
    return classifyInferenceError(error, protocol)
  }
}

const unsupportedLlmDetector: Detector = async () =>
  result('CHECK_UNSUPPORTED', 'degraded', 'existence')

const mediaExistenceDetector: Detector = async ({ userId, model, provider }) => {
  if (getProviderKey(model.provider) !== 'openai-compatible' || !provider.baseUrl) {
    return result('DISCOVERY_UNSUPPORTED', 'degraded', 'existence')
  }
  try {
    const discovered = await discoverModels({
      userId,
      providerId: model.provider,
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
    })
    return discovered.models.some((candidate) => candidate.id === model.modelId)
      ? result('MODEL_DISCOVERED', 'degraded', 'existence')
      : result('MODEL_NOT_FOUND', 'unhealthy', 'existence')
  } catch (error) {
    if (error instanceof ModelDiscoveryError) {
      if (error.code === 'UPSTREAM_AUTH') return result('AUTH_FAILED', 'unhealthy', 'existence')
      if (error.code === 'SSRF_BLOCKED' || error.code === 'INVALID_URL') return result('SSRF_BLOCKED', 'unhealthy', 'existence')
      if (error.status === 429) return result('RATE_LIMITED', 'degraded', 'existence')
      if (error.code === 'NETWORK') return result('NETWORK_ERROR', 'degraded', 'existence')
      if (error.code === 'NO_MODELS' || error.status === 404 || error.status === 405 || error.status === 501) return result('DISCOVERY_UNSUPPORTED', 'degraded', 'existence')
      if (error.status && error.status >= 500) return result('UPSTREAM_UNAVAILABLE', 'degraded', 'existence')
    }
    return result('INVALID_RESPONSE', 'degraded', 'existence')
  }
}

const detectorRegistry = new Map<string, Detector>([
  ['openai-compatible:llm', openAICompatibleLlmDetector],
  ['*:llm', unsupportedLlmDetector],
  ['*:image', mediaExistenceDetector],
  ['*:video', mediaExistenceDetector],
  ['*:audio', mediaExistenceDetector],
])

function detectorFor(model: CustomModel): Detector | undefined {
  return detectorRegistry.get(`${getProviderKey(model.provider)}:${model.type}`) ?? detectorRegistry.get(`*:${model.type}`)
}

async function persist(userId: string, health: ModelHealthResult): Promise<void> {
  const modelKeyHash = createHash('sha256').update(health.modelKey).digest('hex')
  const data = {
    providerId: health.providerId,
    modelKey: health.modelKey,
    modelKeyHash,
    modelId: health.modelId,
    modelType: health.modelType,
    status: health.status,
    checkLevel: health.checkLevel,
    checkedAt: new Date(health.checkedAt),
    latencyMs: health.latencyMs,
    errorCode: health.errorCode,
    message: health.message,
    protocol: health.protocol,
  }
  const existing = await prisma.modelHealthStatus.findUnique({
    where: { userId_providerId_modelKeyHash: { userId, providerId: health.providerId, modelKeyHash } },
    select: { modelKey: true },
  })
  if (existing && existing.modelKey !== health.modelKey) throw new Error('MODEL_HEALTH_HASH_COLLISION')
  await prisma.modelHealthStatus.upsert({
    where: { userId_providerId_modelKeyHash: { userId, providerId: health.providerId, modelKeyHash } },
    create: { userId, ...data },
    update: data,
  })
}

async function executeCheck(userId: string, providerId: string, modelKey: string): Promise<ModelHealthResult> {
  const models = await getUserModels(userId)
  const model = models.find((candidate) => candidate.modelKey === modelKey && candidate.provider === providerId)
  if (!model) throw new Error('MODEL_HEALTH_MODEL_NOT_FOUND')
  const provider = await getProviderConfig(userId, providerId)
  const detector = detectorFor(model)
  if (!detector) throw new Error('MODEL_HEALTH_TYPE_UNSUPPORTED')
  const startedAt = Date.now()
  let detected
  try {
    detected = await detector({ userId, model, provider })
  } catch (error) {
    detected = error instanceof ModelDiscoveryError
      ? result('SSRF_BLOCKED', 'unhealthy', model.type === 'llm' ? 'inference' : 'existence')
      : classifyInferenceError(error)
  }
  const health: ModelHealthResult = {
    ...detected,
    providerId,
    modelKey,
    modelId: model.modelId,
    modelType: model.type,
    checkedAt: new Date().toISOString(),
    latencyMs: Date.now() - startedAt,
  }
  await persist(userId, health)
  return health
}

export function checkModelHealth(input: { userId: string; providerId: string; modelKey: string }): Promise<ModelHealthResult> {
  const key = `${input.userId}\0${input.modelKey}`
  const active = inFlight.get(key)
  if (active) return active
  const cached = recent.get(key)
  if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.result)
  const promise = executeCheck(input.userId, input.providerId, input.modelKey)
    .then((health) => {
      recent.set(key, { expiresAt: Date.now() + DEBOUNCE_MS, result: health })
      return health
    })
    .finally(() => inFlight.delete(key))
  inFlight.set(key, promise)
  return promise
}

export async function checkProviderHealth(input: { userId: string; providerId: string }): Promise<{ results: ModelHealthResult[]; summary: Record<ModelHealth, number> }> {
  await getProviderConfig(input.userId, input.providerId)
  const models = (await getUserModels(input.userId)).filter((model) => model.provider === input.providerId)
  if (!models.length) throw new Error('MODEL_HEALTH_PROVIDER_MODELS_NOT_FOUND')
  const results: ModelHealthResult[] = new Array(models.length)
  let cursor = 0
  async function worker() {
    while (cursor < models.length) {
      const index = cursor++
      const model = models[index]
      try {
        results[index] = await checkModelHealth({ userId: input.userId, providerId: input.providerId, modelKey: model.modelKey })
      } catch {
        results[index] = {
          status: 'unhealthy', checkLevel: model.type === 'llm' ? 'inference' : 'existence', checkedAt: new Date().toISOString(),
          errorCode: 'CHECK_FAILED', message: 'Model health check failed', providerId: input.providerId,
          modelKey: model.modelKey, modelId: model.modelId, modelType: model.type,
        }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(2, models.length) }, () => worker()))
  const summary: Record<ModelHealth, number> = { unknown: 0, healthy: 0, degraded: 0, unhealthy: 0 }
  for (const health of results) summary[health.status] += 1
  return { results, summary }
}

export async function getModelHealthStatuses(userId: string, providerId?: string): Promise<ModelHealthResult[]> {
  const rows = await prisma.modelHealthStatus.findMany({
    where: { userId, ...(providerId ? { providerId } : {}) },
    orderBy: { checkedAt: 'desc' },
  })
  return rows.map((row) => ({
    status: row.status as ModelHealth,
    checkLevel: row.checkLevel as ModelHealthCheckLevel,
    checkedAt: row.checkedAt.toISOString(),
    ...(row.latencyMs === null ? {} : { latencyMs: row.latencyMs }),
    ...(row.errorCode ? { errorCode: row.errorCode } : {}),
    ...(row.message ? { message: row.message } : {}),
    providerId: row.providerId,
    modelKey: row.modelKey,
    modelId: row.modelId,
    modelType: row.modelType as CustomModel['type'],
    ...(row.protocol ? { protocol: row.protocol as ModelHealthProtocol } : {}),
  }))
}

export function clearModelHealthRuntimeState(): void {
  inFlight.clear()
  recent.clear()
}
