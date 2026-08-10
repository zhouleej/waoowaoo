import { describe, expect, it } from 'vitest'
import { buildMobileCloudUsageCsv } from '@/lib/mobile-cloud-maas/usage-export'

describe('Mobile Cloud query usage export', () => {
  it('builds an Excel-compatible UTF-8 CSV with escaped cells', () => {
    const csv = buildMobileCloudUsageCsv([{
      taskId: 'task,"1', userName: 'ram-a', inputTokens: 1, outputTokens: 2, totalTokens: 3,
      videoInputTokens: 0, noVideoInputTokens: 3, videoInput1080pTokens: 0,
      noVideoInput1080pTokens: 0, costAmount: 0.12, deductTime: '2026-07-01 10:00:00',
    }])
    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv).toContain('"任务 ID"')
    expect(csv).toContain('"task,""1"')
  })
})
