import {
  assertOfficialModelRegistered,
  type OfficialModelModality,
} from '@/lib/providers/official/model-registry'
import { getProviderConfig } from '@/lib/api-config'
import type { GenerateResult } from '@/lib/generators/base'
import { ensureBailianCatalogRegistered } from './catalog'
import type { BailianGenerateRequestOptions } from './types'

export interface BailianImageGenerateParams {
  userId: string
  prompt: string
  referenceImages?: string[]
  options: BailianGenerateRequestOptions
}

function assertRegistered(modelId: string): void {
  ensureBailianCatalogRegistered()
  assertOfficialModelRegistered({
    provider: 'bailian',
    modality: 'image' satisfies OfficialModelModality,
    modelId,
  })
}

const BAILIAN_IMAGE_ENDPOINT = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/image-generation/generation'
const BAILIAN_LEGACY_IMAGE_ENDPOINT = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis'

interface BailianImageSubmitResponse {
  request_id?: string
  code?: string
  message?: string
  output?: {
    task_id?: string
    task_status?: string
  }
}

interface BailianImageSubmitParameters {
  size?: string
  n?: number
}

interface BailianImageNewSubmitBody {
  model: string
  input: {
    messages: Array<{
      role: 'user'
      content: Array<{
        text: string
      }>
    }>
  }
  parameters?: BailianImageSubmitParameters
}

interface BailianImageLegacySubmitBody {
  model: string
  input: {
    prompt: string
  }
  parameters?: BailianImageSubmitParameters
}

type BailianImageSubmitBody = BailianImageNewSubmitBody | BailianImageLegacySubmitBody

function readTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readOptionalPositiveInteger(value: unknown, fieldName: string): number | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(`BAILIAN_IMAGE_OPTION_INVALID_${fieldName.toUpperCase()}`)
  }
  return value
}

function aspectRatioToBailianSize(aspectRatio: string): string | undefined {
  const normalized = aspectRatio.trim().replace('/', ':')
  const map: Record<string, string> = {
    '1:1': '1280*1280',
    '16:9': '1696*960',
    '9:16': '960*1696',
    '4:3': '1472*1104',
    '3:4': '1104*1472',
    '3:2': '1568*1040',
    '2:3': '1040*1568',
    '21:9': '2016*864',
  }
  return map[normalized]
}

function usesNewImageProtocol(modelId: string): boolean {
  return modelId === 'wan2.6-t2i'
}

function assertNoUnsupportedOptions(options: BailianGenerateRequestOptions): void {
  const allowedOptionKeys = new Set([
    'provider',
    'modelId',
    'modelKey',
    'prompt',
    'referenceImages',
    'aspectRatio',
    'resolution',
    'size',
    'count',
    'outputFormat',
    'keepOriginalAspectRatio',
  ])
  for (const [key, value] of Object.entries(options)) {
    if (value === undefined) continue
    if (!allowedOptionKeys.has(key)) {
      throw new Error(`BAILIAN_IMAGE_OPTION_UNSUPPORTED: ${key}`)
    }
  }
}

function buildSubmitRequest(params: BailianImageGenerateParams): {
  endpoint: string
  body: BailianImageSubmitBody
} {
  const modelId = readTrimmedString(params.options.modelId)
  if (!modelId) {
    throw new Error('BAILIAN_IMAGE_MODEL_ID_REQUIRED')
  }
  const prompt = readTrimmedString(params.prompt) || readTrimmedString(params.options.prompt)
  if (!prompt) {
    throw new Error('BAILIAN_IMAGE_PROMPT_REQUIRED')
  }

  const size = readTrimmedString(params.options.size)
    || readTrimmedString(params.options.resolution)
    || aspectRatioToBailianSize(readTrimmedString(params.options.aspectRatio))
  const count = readOptionalPositiveInteger(params.options.count, 'count')
  const submitParameters: BailianImageSubmitParameters = {}
  if (size) {
    submitParameters.size = size
  }
  if (count !== undefined) {
    submitParameters.n = count
  }

  const body: BailianImageSubmitBody = usesNewImageProtocol(modelId)
    ? {
      model: modelId,
      input: {
        messages: [
          {
            role: 'user',
            content: [{ text: prompt }],
          },
        ],
      },
    }
    : {
      model: modelId,
      input: { prompt },
    }
  if (Object.keys(submitParameters).length > 0) {
    body.parameters = submitParameters
  }
  return {
    endpoint: usesNewImageProtocol(modelId) ? BAILIAN_IMAGE_ENDPOINT : BAILIAN_LEGACY_IMAGE_ENDPOINT,
    body,
  }
}

async function parseSubmitResponse(response: Response): Promise<BailianImageSubmitResponse> {
  const raw = await response.text()
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('BAILIAN_IMAGE_RESPONSE_INVALID')
    }
    return parsed as BailianImageSubmitResponse
  } catch {
    throw new Error('BAILIAN_IMAGE_RESPONSE_INVALID_JSON')
  }
}

export async function generateBailianImage(params: BailianImageGenerateParams): Promise<GenerateResult> {
  assertRegistered(params.options.modelId)
  assertNoUnsupportedOptions(params.options)

  const { apiKey } = await getProviderConfig(params.userId, params.options.provider)
  const submitRequest = buildSubmitRequest(params)
  const response = await fetch(submitRequest.endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-DashScope-Async': 'enable',
    },
    body: JSON.stringify(submitRequest.body),
  })
  const data = await parseSubmitResponse(response)

  if (!response.ok) {
    const code = readTrimmedString(data.code)
    const message = readTrimmedString(data.message)
    throw new Error(`BAILIAN_IMAGE_SUBMIT_FAILED(${response.status}): ${code || message || 'unknown error'}`)
  }

  const taskId = readTrimmedString(data.output?.task_id)
  if (!taskId) {
    throw new Error('BAILIAN_IMAGE_TASK_ID_MISSING')
  }

  return {
    success: true,
    async: true,
    requestId: taskId,
    externalId: `BAILIAN:IMAGE:${taskId}`,
  }
}
