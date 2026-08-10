import type { MobileCloudUsageRow } from './types'

const COLUMNS: Array<{ key: keyof MobileCloudUsageRow; label: string }> = [
  { key: 'deductTime', label: '扣减时间' },
  { key: 'taskId', label: '任务 ID' },
  { key: 'userName', label: '用户名' },
  { key: 'inputTokens', label: '输入 Tokens（任务实际消耗）' },
  { key: 'outputTokens', label: '输出 Tokens（任务实际消耗）' },
  { key: 'totalTokens', label: '总 Tokens（输入 + 输出）' },
  { key: 'videoInputTokens', label: '有视频输入 Tokens' },
  { key: 'noVideoInputTokens', label: '无视频输入 Tokens' },
  { key: 'videoInput1080pTokens', label: '有视频输入 1080p Tokens' },
  { key: 'noVideoInput1080pTokens', label: '无视频输入 1080p Tokens' },
  { key: 'costAmount', label: '资源点数' },
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

export function buildMobileCloudUsageFilename(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ''
  return `查询明细-${read('year')}${read('month')}${read('day')}-${read('hour')}${read('minute')}${read('second')}.csv`
}
