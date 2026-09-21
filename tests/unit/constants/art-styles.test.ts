import { describe, expect, it } from 'vitest'
import { ART_STYLES, getArtStylePrompt, isArtStyleValue } from '@/lib/constants'

const importedStyleValues = [
  'premium-chinese-anime',
  'japanese-anime',
  'shonen-anime',
  'romance-anime',
  'ancient-chinese-anime',
  'xianxia-anime',
  'wuxia-ink',
  'webtoon',
  'american-comic',
  'semi-realistic-anime',
  'cinematic-realistic',
  '3d-animation',
  'stylized-3d',
  'cyberpunk-anime',
  'dark-fantasy',
  'retro-anime',
] as const

describe('ART_STYLES', () => {
  it('includes every style imported from the new style prompt catalog', () => {
    const values = new Set(ART_STYLES.map((style) => style.value))

    expect(importedStyleValues.every((value) => values.has(value))).toBe(true)
    expect(values.size).toBe(ART_STYLES.length)
  })

  it('keeps historical style values valid for existing projects and assets', () => {
    expect(isArtStyleValue('chinese-comic')).toBe(true)
    expect(isArtStyleValue('realistic')).toBe(true)
  })

  it('returns complete localized prompts for every style', () => {
    for (const style of ART_STYLES) {
      expect(getArtStylePrompt(style.value, 'zh')).toBe(style.promptZh)
      expect(getArtStylePrompt(style.value, 'en')).toBe(style.promptEn)
      expect(style.promptZh.length).toBeGreaterThan(35)
      expect(style.promptEn.length).toBeGreaterThan(35)
    }
  })

  it('maps american-comic to American comic prompts instead of Japanese anime prompts', () => {
    expect(getArtStylePrompt('american-comic', 'zh')).toContain('美式漫画')
    expect(getArtStylePrompt('american-comic', 'en')).toContain('American comic-book')
    expect(getArtStylePrompt('american-comic', 'zh')).not.toBe('日式动漫风格')
  })

  it('rejects unknown values without inventing a fallback prompt', () => {
    expect(isArtStyleValue('unknown-style')).toBe(false)
    expect(getArtStylePrompt('unknown-style', 'zh')).toBe('')
  })
})
