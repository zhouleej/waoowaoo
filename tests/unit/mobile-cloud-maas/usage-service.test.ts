import { describe, expect, it, vi } from 'vitest'
import { createMobileCloudMaasUsageService, countInclusiveDays, getCalendarDatePreset } from '@/lib/mobile-cloud-maas/usage-service'

const deductionRow = {
  taskId: 'task-1',
  userName: 'ram-user',
  inputTokens: 0,
  outputTokens: 216900,
  totalTokens: 216900,
  videoInputTokens: 100000,
  noVideoInputTokens: 116900,
  videoInput1080pTokens: 0,
  noVideoInput1080pTokens: 0,
  costAmount: 12.1464,
  deductTime: '2026-07-14 15:00:00',
}

describe('Mobile Cloud direct deduction usage service', () => {
  it('validates inclusive date ranges and presets', () => {
    expect(countInclusiveDays('2026-07-01', '2026-07-20')).toBe(20)
    expect(() => countInclusiveDays('2026-07-20', '2026-07-01')).toThrow('MOBILE_CLOUD_DATE_RANGE_INVALID')
    expect(getCalendarDatePreset(30, new Date('2026-07-20T12:00:00+08:00'))).toEqual({ beginDate: '2026-06-21', endDate: '2026-07-20' })
  })

  it('walks direct deduction pages, aggregates totals/trend, and paginates locally', async () => {
    const queryDeductions = vi.fn()
      .mockResolvedValueOnce({ pageNo: 1, pageSize: 100, total: 101, items: [deductionRow] })
      .mockResolvedValueOnce({ pageNo: 2, pageSize: 100, total: 101, items: [{ ...deductionRow, taskId: 'task-2', deductTime: '2026-07-13 12:00:00', costAmount: 2 }] })
    const service = createMobileCloudMaasUsageService({ client: { queryDeductions } })
    const result = await service.query({ beginDate: '2026-07-01', endDate: '2026-07-20', apiKey: 'key-name', ramName: '', page: 1, pageSize: 1 })

    expect(queryDeductions).toHaveBeenNthCalledWith(1, expect.objectContaining({ pageNo: 1, beginTime: '2026-07-01 00:00:00', endTime: '2026-07-21 00:00:00', apiKey: 'key-name' }))
    expect(queryDeductions).toHaveBeenCalledTimes(2)
    expect(result.summary).toMatchObject({ totalTokens: 433800, costAmount: 14.1464, videoInputTokens: 200000 })
    expect(result.trend).toEqual([
      { date: '2026-07-13', totalTokens: 216900, costAmount: 2 },
      { date: '2026-07-14', totalTokens: 216900, costAmount: 12.1464 },
    ])
    expect(result.rows).toHaveLength(1)
    expect(result.pagination).toMatchObject({ page: 1, pageSize: 1, total: 2, totalPages: 2 })
  })

  it('splits a 30-day selection into upstream-safe date windows', async () => {
    const queryDeductions = vi.fn().mockResolvedValue({ pageNo: 1, pageSize: 100, total: 0, items: [] })
    const service = createMobileCloudMaasUsageService({ client: { queryDeductions } })

    await service.query({ beginDate: '2026-07-12', endDate: '2026-08-10', apiKey: '', ramName: '', page: 1, pageSize: 20 })

    expect(queryDeductions).toHaveBeenCalledTimes(2)
    expect(queryDeductions).toHaveBeenNthCalledWith(1, expect.objectContaining({
      beginTime: '2026-07-12 00:00:00',
      endTime: '2026-08-10 00:00:00',
    }))
    expect(queryDeductions).toHaveBeenNthCalledWith(2, expect.objectContaining({
      beginTime: '2026-08-10 00:00:00',
      endTime: '2026-08-11 00:00:00',
    }))
  })
})
