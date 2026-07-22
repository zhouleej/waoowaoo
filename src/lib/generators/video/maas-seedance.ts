import { getProviderConfig } from '@/lib/api-config'
import { getPublicBaseUrl } from '@/lib/env'
import { normalizeToOriginalMediaUrl } from '@/lib/media/outbound-image'
import { BaseVideoGenerator, type GenerateResult, type VideoGenerateParams } from '../base'

// #region debug-point A-E:maas-normalized-url-reporting
function debugUrlMetadata(fieldName: string, value: string) {
  try {
    const parsed = new URL(value)
    const hostname = parsed.hostname.toLowerCase()
    const ipv4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)?.slice(1).map(Number)
    const isPrivate = Boolean(ipv4 && (ipv4[0] === 10 || ipv4[0] === 127 || (ipv4[0] === 169 && ipv4[1] === 254) || (ipv4[0] === 172 && ipv4[1] >= 16 && ipv4[1] <= 31) || (ipv4[0] === 192 && ipv4[1] === 168)))
    return {
      fieldName,
      scheme: parsed.protocol.replace(/:$/, ''),
      hostname,
      port: parsed.port || null,
      pathnameCategory: parsed.pathname === '/' || parsed.pathname === '' ? 'root' : parsed.pathname.startsWith('/api/storage/') ? 'api-storage' : 'object-path',
      isLocalhost: hostname === 'localhost' || hostname.endsWith('.localhost'),
      isPrivate,
      isInternal: hostname.endsWith('.local') || hostname.endsWith('.internal') || (!hostname.includes('.') && hostname !== 'localhost'),
    }
  } catch {
    return { fieldName, scheme: null, hostname: null, port: null, pathnameCategory: 'invalid', isLocalhost: false, isPrivate: false, isInternal: false }
  }
}

function reportDebugUrls(location: string, urls: Array<{ fieldName: string, value: string }>) {
  void import('node:fs').then(({ readFileSync }) => {
    let endpoint = 'http://127.0.0.1:7777/event'
    let sessionId = 'maas-private-image-url'
    try {
      const env = readFileSync('.dbg/maas-private-image-url.env', 'utf8')
      endpoint = env.match(/^DEBUG_SERVER_URL=(.+)$/m)?.[1]?.trim() || endpoint
      sessionId = env.match(/^DEBUG_SESSION_ID=(.+)$/m)?.[1]?.trim() || sessionId
    } catch {}
    return fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, runId: 'post-fix', hypothesisId: 'A-E', location, msg: '[DEBUG] MAAS URL metadata', data: { urls: urls.map(({ fieldName, value }) => debugUrlMetadata(fieldName, value)) }, ts: Date.now() }),
    })
  }).catch(() => {})
}
// #endregion

interface MaasSeedanceVideoOptions {
  provider?: string
  modelId?: string
  modelKey?: string
  duration?: number
  aspectRatio?: string
  ratio?: string
  generateAudio?: boolean
  watermark?: boolean
  lastFrameImageUrl?: string
  referenceImages?: string[]
  referenceVideos?: string[]
  referenceAudios?: string[]
}

function requireHttpUrl(value: string, fieldName: string): string {
  const trimmed = value.trim()
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    throw new Error(`MAAS_SEEDANCE_PUBLIC_URL_REQUIRED: ${fieldName}`)
  }
  return trimmed
}

async function normalizeUrlList(value: unknown, fieldName: string): Promise<string[]> {
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    throw new Error(`MAAS_SEEDANCE_OPTION_INVALID: ${fieldName}`)
  }
  const publicMediaOptions = { absoluteBaseUrl: getPublicBaseUrl() }
  return await Promise.all(value.map(async (item, index) => requireHttpUrl(
    await normalizeToOriginalMediaUrl(String(item), publicMediaOptions),
    `${fieldName}[${index}]`,
  )))
}

function normalizeBaseUrl(value: string | undefined): string {
  const trimmed = value?.trim()
  if (!trimmed) {
    throw new Error('MAAS_SEEDANCE_BASE_URL_REQUIRED')
  }
  return trimmed.replace(/\/+$/, '')
}

export class MaasSeedanceVideoGenerator extends BaseVideoGenerator {
  protected async doGenerate(params: VideoGenerateParams): Promise<GenerateResult> {
    const { userId, imageUrl, prompt = '', options = {} } = params
    const rawOptions = options as MaasSeedanceVideoOptions
    const providerId = rawOptions.provider || 'maas-seedance'
    const config = await getProviderConfig(userId, providerId)
    const baseUrl = normalizeBaseUrl(config.baseUrl)
    const model = rawOptions.modelId || 'doubao-seedance-2.0'
    const trimmedPrompt = prompt.trim()
    if (!trimmedPrompt) {
      throw new Error('MAAS_SEEDANCE_PROMPT_REQUIRED')
    }

    const publicMediaOptions = { absoluteBaseUrl: getPublicBaseUrl() }
    const normalizedImageUrl = await normalizeToOriginalMediaUrl(imageUrl, publicMediaOptions)
    const normalizedLastFrameImageUrl = rawOptions.lastFrameImageUrl
      ? await normalizeToOriginalMediaUrl(rawOptions.lastFrameImageUrl, publicMediaOptions)
      : undefined
    const body = {
      model,
      prompt: trimmedPrompt,
      image_url: requireHttpUrl(normalizedImageUrl, 'imageUrl'),
      ...(normalizedLastFrameImageUrl ? { last_frame_image_url: requireHttpUrl(normalizedLastFrameImageUrl, 'lastFrameImageUrl') } : {}),
      reference_images: await normalizeUrlList(rawOptions.referenceImages, 'referenceImages'),
      reference_videos: await normalizeUrlList(rawOptions.referenceVideos, 'referenceVideos'),
      reference_audios: await normalizeUrlList(rawOptions.referenceAudios, 'referenceAudios'),
      ...(typeof rawOptions.duration === 'number' ? { duration: rawOptions.duration } : {}),
      ...(rawOptions.aspectRatio || rawOptions.ratio ? { ratio: rawOptions.aspectRatio || rawOptions.ratio } : {}),
      ...(typeof rawOptions.generateAudio === 'boolean' ? { generate_audio: rawOptions.generateAudio } : {}),
      ...(typeof rawOptions.watermark === 'boolean' ? { watermark: rawOptions.watermark } : {}),
    }

    // #region debug-point A-E:node-before-python
    reportDebugUrls('src/lib/generators/video/maas-seedance.ts:before-python', [
      { fieldName: 'image_url', value: body.image_url },
      ...('last_frame_image_url' in body ? [{ fieldName: 'last_frame_image_url', value: body.last_frame_image_url as string }] : []),
      ...body.reference_images.map((value, index) => ({ fieldName: `reference_images[${index}]`, value })),
      ...body.reference_videos.map((value, index) => ({ fieldName: `reference_videos[${index}]`, value })),
      ...body.reference_audios.map((value, index) => ({ fieldName: `reference_audios[${index}]`, value })),
    ])
    // #endregion

    const response = await fetch(`${baseUrl}/v1/videos/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
    })
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>
    if (!response.ok) {
      const detail = typeof payload.detail === 'string' ? payload.detail : response.statusText
      throw new Error(`MAAS_SEEDANCE_CREATE_FAILED: ${response.status} ${detail}`)
    }

    const taskId = typeof payload.id === 'string' ? payload.id.trim() : ''
    if (!taskId) {
      throw new Error('MAAS_SEEDANCE_CREATE_INVALID_RESPONSE: missing id')
    }

    return {
      success: true,
      async: true,
      requestId: taskId,
      externalId: `MAAS:VIDEO:${encodeURIComponent(providerId)}:${taskId}`,
    }
  }
}
