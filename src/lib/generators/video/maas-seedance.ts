import { getProviderConfig } from '@/lib/api-config'
import { getPublicBaseUrl } from '@/lib/env'
import { normalizeToOriginalMediaUrl } from '@/lib/media/outbound-image'
import { BaseVideoGenerator, type GenerateResult, type VideoGenerateParams } from '../base'

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
