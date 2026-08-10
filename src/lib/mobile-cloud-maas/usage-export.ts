import type { MobileCloudUsageRow } from './types'

const COLUMNS: Array<{ key: keyof MobileCloudUsageRow; label: string }> = [
  { key: 'deductTime', label: '扣费时间' },
  { key: 'taskId', label: '任务 ID' },
  { key: 'userName', label: '用户' },
  { key: 'inputTokens', label: '输入 Tokens' },
  { key: 'outputTokens', label: '输出 Tokens' },
  { key: 'totalTokens', label: '总 Tokens' },
  { key: 'videoInputTokens', label: '视频输入 Tokens' },
  { key: 'noVideoInputTokens', label: '无视频输入 Tokens' },
  { key: 'videoInput1080pTokens', label: '1080P 视频输入 Tokens' },
  { key: 'noVideoInput1080pTokens', label: '1080P 无视频输入 Tokens' },
  { key: 'costAmount', label: '费用（元）' },
]

function csvCell(value: unknown): string {
  return `"${String(value ?? '').replaceAll('"', '""')}"`
}

export function buildMobileCloudUsageCsv(rows: MobileCloudUsageRow[]): string {
  const lines = [
    COLUMNS.map((column) => csvCell(column.label)).join(','),
    ...rows.map((row) => COLUMNS.map((column) => csvCell(row[column.key])).join(',')),
  ]
  return `\uFEFF${lines.join('\r\n')}\r\n`
}
