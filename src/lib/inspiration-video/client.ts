import {
  INSPIRATION_AUDIO_EXTENSIONS,
  INSPIRATION_AUDIO_MIME_TYPES,
  INSPIRATION_IMAGE_EXTENSIONS,
  INSPIRATION_IMAGE_MIME_TYPES,
  INSPIRATION_VIDEO_LIMITS,
} from '@/lib/inspiration-video/limits'

type SubmissionCrypto = Pick<Crypto, 'getRandomValues'> & Partial<Pick<Crypto, 'randomUUID'>>

export type InspirationFileValidationIssue = {
  code: 'imageType' | 'imageSize' | 'audioType' | 'audioSize' | 'totalSize'
  fileName?: string
  limitBytes: number
}

function extensionOf(fileName: string): string {
  return fileName.split('.').pop()?.toLowerCase() || ''
}

function randomHex(cryptoSource: SubmissionCrypto | undefined): string | null {
  if (!cryptoSource || typeof cryptoSource.getRandomValues !== 'function') return null
  const bytes = new Uint8Array(16)
  cryptoSource.getRandomValues(bytes)
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')
}

export function createInspirationSubmissionId(
  cryptoSource: SubmissionCrypto | undefined = globalThis.crypto,
): string {
  if (typeof cryptoSource?.randomUUID === 'function') return cryptoSource.randomUUID()

  const secureRandom = randomHex(cryptoSource)
  if (secureRandom) return `iv_${secureRandom}`

  const fallback = Math.random().toString(36).slice(2).padEnd(12, '0')
  return `iv_${Date.now().toString(36)}_${fallback}`
}

export function validateInspirationVideoFiles(input: {
  primaryImage: File | null
  referenceImages: File[]
  referenceAudios: File[]
}): InspirationFileValidationIssue | null {
  const images = [input.primaryImage, ...input.referenceImages].filter((file): file is File => Boolean(file))

  for (const file of images) {
    if (!INSPIRATION_IMAGE_MIME_TYPES.has(file.type.toLowerCase())
      || !INSPIRATION_IMAGE_EXTENSIONS.has(extensionOf(file.name))) {
      return { code: 'imageType', fileName: file.name, limitBytes: INSPIRATION_VIDEO_LIMITS.imageBytes }
    }
    if (file.size > INSPIRATION_VIDEO_LIMITS.imageBytes) {
      return { code: 'imageSize', fileName: file.name, limitBytes: INSPIRATION_VIDEO_LIMITS.imageBytes }
    }
  }

  for (const file of input.referenceAudios) {
    if (!INSPIRATION_AUDIO_MIME_TYPES.has(file.type.toLowerCase())
      || !INSPIRATION_AUDIO_EXTENSIONS.has(extensionOf(file.name))) {
      return { code: 'audioType', fileName: file.name, limitBytes: INSPIRATION_VIDEO_LIMITS.audioBytes }
    }
    if (file.size > INSPIRATION_VIDEO_LIMITS.audioBytes) {
      return { code: 'audioSize', fileName: file.name, limitBytes: INSPIRATION_VIDEO_LIMITS.audioBytes }
    }
  }

  const totalBytes = [...images, ...input.referenceAudios].reduce((sum, file) => sum + file.size, 0)
  if (totalBytes > INSPIRATION_VIDEO_LIMITS.totalBytes) {
    return { code: 'totalSize', limitBytes: INSPIRATION_VIDEO_LIMITS.totalBytes }
  }

  return null
}
