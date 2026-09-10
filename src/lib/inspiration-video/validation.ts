import { ApiError } from '@/lib/api-errors'

export const INSPIRATION_VIDEO_LIMITS = {
  promptCharacters: 2_000,
  imageBytes: 10 * 1024 * 1024,
  audioBytes: 30 * 1024 * 1024,
  referenceImages: 8,
  referenceAudios: 3,
  totalAssets: 12,
  totalBytes: 80 * 1024 * 1024,
} as const

const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp'])
const AUDIO_MIME_TYPES = new Set([
  'audio/aac',
  'audio/m4a',
  'audio/mp4',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/wave',
  'audio/webm',
  'audio/x-m4a',
  'audio/x-wav',
])
const AUDIO_EXTENSIONS = new Set(['aac', 'm4a', 'mp3', 'mp4', 'ogg', 'wav', 'webm'])

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
  primaryImage: UploadFile
  referenceImages: UploadFile[]
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
    ? IMAGE_MIME_TYPES.has(mimeType) && IMAGE_EXTENSIONS.has(extension)
    : AUDIO_MIME_TYPES.has(mimeType) && AUDIO_EXTENSIONS.has(extension)
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
  const referenceImages = readFiles(formData, 'referenceImages')
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
  if (primaryImages.length !== 1) throw new ApiError('INVALID_PARAMS', { field: 'primaryImage' })
  if (referenceImages.length > INSPIRATION_VIDEO_LIMITS.referenceImages) {
    throw new ApiError('INVALID_PARAMS', { field: 'referenceImages' })
  }
  if (referenceAudios.length > INSPIRATION_VIDEO_LIMITS.referenceAudios) {
    throw new ApiError('INVALID_PARAMS', { field: 'referenceAudios' })
  }
  if (1 + referenceImages.length + referenceAudios.length > INSPIRATION_VIDEO_LIMITS.totalAssets) {
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

  validateFile(primaryImages[0], 'image', 'primaryImage')
  referenceImages.forEach((file, index) => validateFile(file, 'image', `referenceImages.${index}`))
  referenceAudios.forEach((file, index) => validateFile(file, 'audio', `referenceAudios.${index}`))

  return {
    prompt,
    modelKey,
    aspectRatio,
    resolution,
    duration,
    generateAudio,
    primaryImage: primaryImages[0],
    referenceImages,
    referenceAudios,
  }
}
