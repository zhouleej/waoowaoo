import { beforeEach, describe, expect, it, vi } from 'vitest'

const prismaMock = vi.hoisted(() => ({
  customArtStyle: {
    findFirst: vi.fn(),
  },
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

import {
  customArtStyleId,
  customArtStyleValue,
  parseCustomStyleInput,
  resolveArtStylePrompt,
  snapshotCustomArtStyle,
  validateUserArtStyle,
} from '@/lib/art-styles/custom'

describe('custom art styles', () => {
  const id = '11111111-1111-4111-8111-111111111111'

  beforeEach(() => vi.clearAllMocks())

  it('uses namespaced values and rejects malformed identifiers', () => {
    expect(customArtStyleValue(id)).toBe(`custom:${id}`)
    expect(customArtStyleId(`custom:${id}`)).toBe(id)
    expect(customArtStyleId('custom:not-an-id')).toBeNull()
  })

  it('validates ownership and snapshots the prompt', async () => {
    prismaMock.customArtStyle.findFirst.mockResolvedValue({ id, userId: 'user-1', prompt: 'soft watercolor' })
    const value = `custom:${id}`
    expect(await validateUserArtStyle(value, 'user-1')).toBe(value)
    expect(await snapshotCustomArtStyle(value, 'user-1')).toBe('soft watercolor')
    expect(prismaMock.customArtStyle.findFirst).toHaveBeenCalledWith({ where: { id, userId: 'user-1' } })
  })

  it('prefers a queued snapshot even after the saved style changes', async () => {
    const value = `custom:${id}`
    expect(await resolveArtStylePrompt({ value, userId: 'user-1', locale: 'zh', snapshot: 'queued prompt' })).toBe('queued prompt')
    expect(prismaMock.customArtStyle.findFirst).not.toHaveBeenCalled()
  })

  it('does not resolve queued custom work from mutable database state', async () => {
    await expect(resolveArtStylePrompt({ value: `custom:${id}`, userId: 'user-1', locale: 'zh' }))
      .rejects.toThrow('CUSTOM_ART_STYLE_SNAPSHOT_MISSING')
  })

  it('keeps built-in prompts and validates input limits', async () => {
    expect(await resolveArtStylePrompt({ value: 'realistic', userId: 'user-1', locale: 'en' })).not.toBe('')
    expect(parseCustomStyleInput({ name: '  My style ', prompt: '  vivid colors ' })).toEqual({ name: 'My style', prompt: 'vivid colors' })
    expect(() => parseCustomStyleInput({ name: '', prompt: '' })).toThrow()
  })
})
