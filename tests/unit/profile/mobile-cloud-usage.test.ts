import { describe, expect, it } from 'vitest'
import {
  buildUsageChartPoints,
  getUsageDatePreset,
  normalizeUsagePage,
} from '@/app/[locale]/profile/components/mobile-cloud-usage'

describe('mobile cloud usage profile helpers', () => {
  it('builds inclusive UTC date presets', () => {
    expect(getUsageDatePreset(30, new Date('2026-07-20T12:00:00+08:00'))).toEqual({
      beginDate: '2026-06-21',
      endDate: '2026-07-20',
    })
  })

  it('keeps the local calendar date around the UTC day boundary', () => {
    expect(getUsageDatePreset(1, new Date('2026-07-20T01:00:00+08:00'))).toEqual({
      beginDate: '2026-07-20',
      endDate: '2026-07-20',
    })
  })

  it('scales chart points across the available drawing area', () => {
    expect(buildUsageChartPoints([
      { date: '2026-07-18', totalTokens: 10, totalUsageAmount: 10 },
      { date: '2026-07-19', totalTokens: 20, totalUsageAmount: 20 },
      { date: '2026-07-20', totalTokens: 5, totalUsageAmount: 5 },
    ], 300, 120, 20)).toEqual([
      { x: 20, y: 60 },
      { x: 150, y: 20 },
      { x: 280, y: 80 },
    ])
  })

  it('keeps pagination inside valid bounds', () => {
    expect(normalizeUsagePage(5, 3)).toBe(3)
    expect(normalizeUsagePage(0, 0)).toBe(1)
  })
})
