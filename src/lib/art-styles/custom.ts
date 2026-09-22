import { ApiError } from '@/lib/api-errors'
import { isArtStyleValue, getArtStylePrompt } from '@/lib/constants'
import { prisma } from '@/lib/prisma'

const CUSTOM_PREFIX = 'custom:'
const CUSTOM_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function customArtStyleValue(id: string): string {
  return `${CUSTOM_PREFIX}${id}`
}

export function parseCustomStyleInput(body: unknown): { name: string; prompt: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError('INVALID_PARAMS')
  const record = body as Record<string, unknown>
  const name = typeof record.name === 'string' ? record.name.trim() : ''
  const prompt = typeof record.prompt === 'string' ? record.prompt.trim() : ''
  if (!name || name.length > 80 || !prompt || prompt.length > 4000) {
    throw new ApiError('INVALID_PARAMS', { message: 'Style name (1-80) and prompt (1-4000) are required' })
  }
  return { name, prompt }
}

export function customArtStyleId(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith(CUSTOM_PREFIX)) return null
  const id = value.slice(CUSTOM_PREFIX.length)
  return CUSTOM_ID.test(id) ? id : null
}

export async function findUserCustomArtStyle(userId: string, value: string) {
  const id = customArtStyleId(value)
  if (!id) return null
  return prisma.customArtStyle.findFirst({ where: { id, userId } })
}

export async function validateUserArtStyle(value: unknown, userId: string): Promise<string> {
  const normalized = typeof value === 'string' ? value.trim() : ''
  if (isArtStyleValue(normalized)) return normalized
  if (await findUserCustomArtStyle(userId, normalized)) return normalized
  throw new ApiError('INVALID_PARAMS', {
    code: 'INVALID_ART_STYLE', field: 'artStyle', message: 'artStyle must be a built-in or owned custom style',
  })
}

/** Custom prompts are snapshotted at submission so edits and deletion cannot change queued jobs. */
export async function snapshotCustomArtStyle(value: string, userId: string): Promise<string | null> {
  if (!value.startsWith(CUSTOM_PREFIX)) return null
  const style = await findUserCustomArtStyle(userId, value)
  if (!style) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'INVALID_ART_STYLE', field: 'artStyle', message: 'Custom style is unavailable; choose another style',
    })
  }
  return style.prompt
}

export async function resolveArtStylePrompt(input: {
  value: string | null | undefined
  userId: string
  locale: 'zh' | 'en'
  snapshot?: unknown
}): Promise<string> {
  if (!input.value) return ''
  if (isArtStyleValue(input.value)) return getArtStylePrompt(input.value, input.locale)
  if (input.value.startsWith(CUSTOM_PREFIX)) {
    if (typeof input.snapshot === 'string') return input.snapshot
    throw new Error('CUSTOM_ART_STYLE_SNAPSHOT_MISSING')
  }
  return (await snapshotCustomArtStyle(input.value, input.userId)) || ''
}
