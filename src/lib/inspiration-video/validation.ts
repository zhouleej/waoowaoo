import { ApiError } from '@/lib/api-errors'
import {
  INSPIRATION_AUDIO_EXTENSIONS,
  INSPIRATION_AUDIO_MIME_TYPES,
  INSPIRATION_IMAGE_EXTENSIONS,
  INSPIRATION_IMAGE_MIME_TYPES,
  INSPIRATION_VIDEO_LIMITS,
} from '@/lib/inspiration-video/limits'

export { INSPIRATION_VIDEO_LIMITS } from '@/lib/inspiration-video/limits'

export type UploadFile = File & {
  arrayBuffer(): Promise<ArrayBuffer>
}

export type InspirationVideoDraft = {
  prompt: string
  modelKey: string
  aspectRatio: string
  resolution: string
  duration: number
  generateAudio: boolean
  primaryImage: UploadFile | null
  primaryMobileCloudAssetId: string | null
  referenceImages: UploadFile[]
  referenceMobileCloudAssetIds: string[]
  referenceAudios: UploadFile[]
}

function readRequiredText(formData: FormData, key: string): string {
  const value = formData.get(key)
  return typeof value === 'string' ? value.trim() : ''
}

function isUploadFile(value: FormDataEntryValue): value is UploadFile {
  return typeof value === 'object'
    && value !== null
    && typeof (value as UploadFile).arrayBuffer === 'function'
    && typeof (value as UploadFile).name === 'string'
    && typeof (value as UploadFile).size === 'number'
}

function readFiles(formData: FormData, key: string): UploadFile[] {
  return formData.getAll(key).filter(isUploadFile).filter((file) => file.size > 0)
}

function readMobileCloudAssetIds(formData: FormData, key: string, maxItems: number): string[] {
  const values = formData.getAll(key)
  if (values.some((value) => typeof value !== 'string')) {
    throw new ApiError('INVALID_PARAMS', { field: key })
  }
  const ids = values.map((value) => String(value).trim())
  if (ids.length > maxItems || ids.some((id) => !id || id.length > 200) || new Set(ids).size !== ids.length) {
    throw new ApiError('INVALID_PARAMS', { field: key })
  }
  return ids
}

function extensionOf(fileName: string): string {
  return fileName.split('.').pop()?.toLowerCase() || ''
}

function validateFile(
  file: UploadFile,
  kind: 'image' | 'audio',
  field: string,
): void {
  const extension = extensionOf(file.name)
  const mimeType = file.type.toLowerCase()
  const validType = kind === 'image'
    ? INSPIRATION_IMAGE_MIME_TYPES.has(mimeType) && INSPIRATION_IMAGE_EXTENSIONS.has(extension)
    : INSPIRATION_AUDIO_MIME_TYPES.has(mimeType) && INSPIRATION_AUDIO_EXTENSIONS.has(extension)
  const maxBytes = kind === 'image'
    ? INSPIRATION_VIDEO_LIMITS.imageBytes
    : INSPIRATION_VIDEO_LIMITS.audioBytes

  if (!validType) {
    throw new ApiError('INVALID_PARAMS', {
      code: kind === 'image' ? 'INSPIRATION_IMAGE_TYPE_INVALID' : 'INSPIRATION_AUDIO_TYPE_INVALID',
      field,
    })
  }
  if (file.size > maxBytes) {
    throw new ApiError('INVALID_PARAMS', {
      code: kind === 'image' ? 'INSPIRATION_IMAGE_TOO_LARGE' : 'INSPIRATION_AUDIO_TOO_LARGE',
      field,
      limit: maxBytes,
    })
  }
}

function readDuration(value: string): number {
  const duration = Number(value)
  if (!Number.isInteger(duration) || duration <= 0 || duration > 120) {
    throw new ApiError('INVALID_PARAMS', { field: 'duration' })
  }
  return duration
}

export function parseInspirationVideoDraft(formData: FormData): InspirationVideoDraft {
  const prompt = readRequiredText(formData, 'prompt')
  const modelKey = readRequiredText(formData, 'modelKey')
  const aspectRatio = readRequiredText(formData, 'aspectRatio')
  const resolution = readRequiredText(formData, 'resolution')
  const duration = readDuration(readRequiredText(formData, 'duration'))
  const generateAudio = readRequiredText(formData, 'generateAudio') !== 'false'
  const primaryImages = readFiles(formData, 'primaryImage')
  const primaryMobileCloudAssetIds = readMobileCloudAssetIds(formData, 'primaryMobileCloudAssetId', 1)
  const referenceImages = readFiles(formData, 'referenceImages')
  const referenceMobileCloudAssetIds = readMobileCloudAssetIds(
    formData,
    'referenceMobileCloudAssetIds',
    INSPIRATION_VIDEO_LIMITS.referenceImages,
  )
  const referenceAudios = readFiles(formData, 'referenceAudios')

  if (!prompt || prompt.length > INSPIRATION_VIDEO_LIMITS.promptCharacters) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'INSPIRATION_PROMPT_INVALID',
      field: 'prompt',
      limit: INSPIRATION_VIDEO_LIMITS.promptCharacters,
    })
  }
  if (!modelKey) throw new ApiError('INVALID_PARAMS', { field: 'modelKey' })
  if (!aspectRatio || aspectRatio.length > 20) throw new ApiError('INVALID_PARAMS', { field: 'aspectRatio' })
  if (!resolution || resolution.length > 20) throw new ApiError('INVALID_PARAMS', { field: 'resolution' })
  if (primaryImages.length > 1) throw new ApiError('INVALID_PARAMS', { field: 'primaryImage' })
  if (primaryImages.length + primaryMobileCloudAssetIds.length > 1) {
    throw new ApiError('INVALID_PARAMS', { field: 'primaryImage' })
  }
  if (referenceImages.length + referenceMobileCloudAssetIds.length > INSPIRATION_VIDEO_LIMITS.referenceImages) {
    throw new ApiError('INVALID_PARAMS', { field: 'referenceImages' })
  }
  if (referenceAudios.length > INSPIRATION_VIDEO_LIMITS.referenceAudios) {
    throw new ApiError('INVALID_PARAMS', { field: 'referenceAudios' })
  }
  const primaryImageCount = primaryImages.length + primaryMobileCloudAssetIds.length
  if (primaryImageCount + referenceImages.length + referenceMobileCloudAssetIds.length + referenceAudios.length > INSPIRATION_VIDEO_LIMITS.totalAssets) {
    throw new ApiError('INVALID_PARAMS', { field: 'assets' })
  }
  const totalBytes = [...primaryImages, ...referenceImages, ...referenceAudios]
    .reduce((sum, file) => sum + file.size, 0)
  if (totalBytes > INSPIRATION_VIDEO_LIMITS.totalBytes) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'INSPIRATION_ASSETS_TOO_LARGE',
      field: 'assets',
      limit: INSPIRATION_VIDEO_LIMITS.totalBytes,
    })
  }

  if (primaryImages[0]) validateFile(primaryImages[0], 'image', 'primaryImage')
  referenceImages.forEach((file, index) => validateFile(file, 'image', `referenceImages.${index}`))
  referenceAudios.forEach((file, index) => validateFile(file, 'audio', `referenceAudios.${index}`))

  return {
    prompt,
    modelKey,
    aspectRatio,
    resolution,
    duration,
    generateAudio,
    primaryImage: primaryImages[0] || null,
    primaryMobileCloudAssetId: primaryMobileCloudAssetIds[0] || null,
    referenceImages,
    referenceMobileCloudAssetIds,
    referenceAudios,
  }
}
