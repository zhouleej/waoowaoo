import type {
  MobileCloudPackageRow,
  MobileCloudPackageSummary,
  MobileCloudUsagePagination,
  MobileCloudUsageRow,
  MobileCloudUsageTrendPoint,
} from './types'

const DAY_MS = 24 * 60 * 60 * 1000

function parseDateOnly(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) throw new Error('MOBILE_CLOUD_DATE_INVALID')
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error('MOBILE_CLOUD_DATE_INVALID')
  }
  return date
}

function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function dateInTimeZone(value: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value)
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || ''
  return `${read('year')}-${read('month')}-${read('day')}`
}

function roundUsage(value: number): number {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000
}

export function countInclusiveDays(beginDate: string, endDate: string): number {
  const begin = parseDateOnly(beginDate)
  const end = parseDateOnly(endDate)
  if (begin.getTime() > end.getTime()) throw new Error('MOBILE_CLOUD_DATE_RANGE_INVALID')
  return Math.floor((end.getTime() - begin.getTime()) / DAY_MS) + 1
}

export function getCalendarDatePreset(
  days: number,
  now = new Date(),
  timeZone = 'Asia/Shanghai',
): { beginDate: string; endDate: string } {
  const endDate = dateInTimeZone(now, timeZone)
  const end = parseDateOnly(endDate)
  const begin = new Date(end.getTime() - (Math.max(1, days) - 1) * DAY_MS)
  return { beginDate: formatDateOnly(begin), endDate }
}

export function splitDateRange(
  beginDate: string,
  endDate: string,
  maxInclusiveDays = 30,
): Array<{ beginDate: string; endDate: string }> {
  if (!Number.isInteger(maxInclusiveDays) || maxInclusiveDays < 1) {
    throw new Error('MOBILE_CLOUD_DATE_CHUNK_INVALID')
  }
  countInclusiveDays(beginDate, endDate)
  const end = parseDateOnly(endDate)
  let cursor = parseDateOnly(beginDate)
  const chunks: Array<{ beginDate: string; endDate: string }> = []

  while (cursor.getTime() <= end.getTime()) {
    const chunkEnd = new Date(Math.min(
      cursor.getTime() + (maxInclusiveDays - 1) * DAY_MS,
      end.getTime(),
    ))
    chunks.push({ beginDate: formatDateOnly(cursor), endDate: formatDateOnly(chunkEnd) })
    cursor = new Date(chunkEnd.getTime() + DAY_MS)
  }
  return chunks
}

export function buildPackageSummary(
  row: MobileCloudPackageRow,
  tokensPerUnit: number | null,
): MobileCloudPackageSummary {
  const configuredTotal = tokensPerUnit !== null && tokensPerUnit > 0
    ? row.productOrderNum * tokensPerUnit
    : null
  const totalTokens = row.totalResourcePoint ?? configuredTotal
  const remainingTokens = row.remainingResourcePoint
  const usedTokens = totalTokens !== null && remainingTokens !== null
    ? Math.max(0, roundUsage(totalTokens - remainingTokens))
    : null
  const usedPercent = totalTokens !== null && totalTokens > 0 && usedTokens !== null
    ? roundUsage((usedTokens / totalTokens) * 100)
    : null

  return {
    instanceId: row.instanceId,
    poolId: row.poolId,
    poolName: row.poolName,
    packageName: row.chaGroupName,
    status: row.resourceStatus,
    productOrderNum: row.productOrderNum,
    effectTime: row.effectTime,
    expireTime: row.expireTime,
    totalTokens,
    usedTokens,
    remainingTokens,
    usedPercent,
  }
}

function usageRowKey(row: MobileCloudUsageRow): string {
  return [
    row.inferenceId,
    row.useTime,
    row.promptTokens,
    row.completionTokens,
    row.totalTokens,
    row.totalUsageAmount,
  ].join('|')
}

export function deduplicateUsageRows(rows: MobileCloudUsageRow[]): MobileCloudUsageRow[] {
  const unique = new Map<string, MobileCloudUsageRow>()
  for (const row of rows) unique.set(usageRowKey(row), row)
  return [...unique.values()].sort((left, right) => right.useTime.localeCompare(left.useTime))
}

export function buildUsageTrend(rows: MobileCloudUsageRow[]): MobileCloudUsageTrendPoint[] {
  const totals = new Map<string, { totalTokens: number; totalUsageAmount: number }>()
  for (const row of rows) {
    const date = row.useTime.slice(0, 10)
    const current = totals.get(date) ?? { totalTokens: 0, totalUsageAmount: 0 }
    current.totalTokens += row.totalTokens
    current.totalUsageAmount = roundUsage(current.totalUsageAmount + row.totalUsageAmount)
    totals.set(date, current)
  }
  return [...totals.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, values]) => ({ date, ...values }))
}

export function paginateUsageRows(
  rows: MobileCloudUsageRow[],
  page: number,
  pageSize: number,
): { rows: MobileCloudUsageRow[]; pagination: MobileCloudUsagePagination } {
  const total = rows.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(Math.max(1, page), totalPages)
  const offset = (safePage - 1) * pageSize
  return {
    rows: rows.slice(offset, offset + pageSize),
    pagination: { page: safePage, pageSize, total, totalPages },
  }
}
