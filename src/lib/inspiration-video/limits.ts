export const INSPIRATION_VIDEO_LIMITS = {
  promptCharacters: 2_000,
  imageBytes: 10 * 1024 * 1024,
  audioBytes: 30 * 1024 * 1024,
  referenceImages: 8,
  referenceAudios: 3,
  totalAssets: 12,
  totalBytes: 80 * 1024 * 1024,
} as const

export const INSPIRATION_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
])

export const INSPIRATION_IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp'])

export const INSPIRATION_AUDIO_MIME_TYPES = new Set([
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

export const INSPIRATION_AUDIO_EXTENSIONS = new Set([
  'aac',
  'm4a',
  'mp3',
  'mp4',
  'ogg',
  'wav',
  'webm',
])
