import { describe, expect, it, vi } from 'vitest'
import {
  changeBillingFilter,
  formatBillingDetail,
  formatTokenCount,
  getBillingTokenUsage,
  moveBillingPage,
  type BillingDetailLabels,
} from '@/app/[locale]/profile/components/billing-records'

const labels: BillingDetailLabels = {
  image: (count) => `${count} images`,
  imageWithRes: (count, resolution) => `${count} images ${resolution}`,
  video: (count) => `${count} videos`,
  videoWithRes: (count, resolution) => `${count} videos ${resolution}`,
  tokens: (count) => `${count} tokens`,
  seconds: (count) => `${count} seconds`,
  calls: (count) => `${count} calls`,
}

describe('billing records helpers', () => {
  it('formats current reporting metadata for images and resolution', () => {
    expect(formatBillingDetail({ unit: 'image', quantity: 3, resolution: '2K' }, labels, 'en')).toEqual([
      '3 images 2K',
    ])
  })

  it('formats video duration and token usage without rendering object values', () => {
    expect(formatBillingDetail({
      unit: 'video',
      quantity: 1,
      resolution: { width: 1280 },
      duration: 5,
      inputTokens: 100,
      outputTokens: 50,
    }, labels, 'en')).toEqual(['1 videos', '5 seconds', '150 tokens'])
  })

  it('extracts actual token usage and keeps input/output breakdown', () => {
    expect(getBillingTokenUsage({
      actualInputTokens: 1234,
      actualOutputTokens: 567,
      inputTokens: 9999,
      outputTokens: 9999,
    })).toEqual({ input: 1234, output: 567, total: 1801 })
    expect(formatTokenCount(1801, 'en')).toBe('1,801')
  })

  it('falls back to token quantity for legacy transaction metadata', () => {
    expect(getBillingTokenUsage({ unit: 'token', quantity: 2500 })).toEqual({ input: null, output: null, total: 2500 })
  })

  it('supports nested legacy metadata and safely omits missing values', () => {
    expect(formatBillingDetail({ metadata: { unit: 'call', quantity: 2 } }, labels, 'en')).toEqual(['2 calls'])
    expect(formatBillingDetail(null, labels, 'en')).toEqual([])
  })

  it('resets page when filter changes and clamps pagination moves', () => {
    expect(changeBillingFilter('recharge')).toEqual({ filter: 'recharge', page: 1 })
    expect(moveBillingPage(1, 'previous', 4)).toBe(1)
    expect(moveBillingPage(4, 'next', 4)).toBe(4)
    expect(moveBillingPage(2, 'next', 4)).toBe(3)
  })

  it('does not stringify unsupported metadata objects', () => {
    const image = vi.fn(labels.image)
    const customLabels = { ...labels, image }
    expect(formatBillingDetail({ unit: {}, quantity: {} }, customLabels, 'en')).toEqual([])
    expect(image).not.toHaveBeenCalled()
  })
})
