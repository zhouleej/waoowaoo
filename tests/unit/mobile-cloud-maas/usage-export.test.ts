import { describe, expect, it } from 'vitest'
import { buildMobileCloudUsageCsv, buildMobileCloudUsageFilename } from '@/lib/mobile-cloud-maas/usage-export'

describe('Mobile Cloud query usage export', () => {
  it('builds an Excel-compatible UTF-8 CSV with escaped cells', () => {
    const csv = buildMobileCloudUsageCsv([{
      taskId: 'task,"1', userName: 'ram-a', inputTokens: 1, outputTokens: 2, totalTokens: 3,
      videoInputTokens: 0, noVideoInputTokens: 3, videoInput1080pTokens: 0,
      noVideoInput1080pTokens: 0, costAmount: 0.12, deductTime: '2026-07-01 10:00:00',
    }])
    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv).toContain('"任务 ID"')
    expect(csv).toContain('"资源点数"')
    expect(csv).toContain('"task,""1"')
  })

  it('uses the Shanghai timestamp in the query-details filename', () => {
    expect(buildMobileCloudUsageFilename(new Date('2026-08-10T04:05:06.000Z'))).toBe('查询明细-20260810-120506.csv')
  })
})
