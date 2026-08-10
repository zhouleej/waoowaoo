import {
  mobileCloudMaasAssetClient,
  type MobileCloudMaasOpenApiError,
} from './asset-client'
import type {
  MobileCloudDeductionRow,
  MobileCloudPage,
} from './asset-types'
import { MOBILE_CLOUD_DEDUCTION_MODEL } from './asset-types'
import type {
  MobileCloudUsageData,
  MobileCloudUsageQuery,
  MobileCloudUsageRow,
  MobileCloudUsageSummary,
  MobileCloudUsageTrendPoint,
} from './types'

interface DeductionClient {
  queryDeductions(input: {
    pageNo?: number
    pageSize?: number
    apiKey?: string
    ramName?: string
    beginTime: string
    endTime: string
  }): Promise<MobileCloudPage<MobileCloudDeductionRow>>
}

interface UsageServiceOptions {
  client?: DeductionClient
  now?: () => number
}

const DAY_MS = 24 * 60 * 60 * 1000
// The upstream rejects a request whose exclusive end is exactly 30 days
// after its begin, so keep each request to 29 inclusive calendar days.
const MAX_QUERY_DAYS = 29

function parseDateOnly(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) throw new Error('MOBILE_CLOUD_DATE_INVALID')
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  if (date.getUTCFullYear() !== Number(match[1]) || date.getUTCMonth() !== Number(match[2]) - 1 || date.getUTCDate() !== Number(match[3])) {
    throw new Error('MOBILE_CLOUD_DATE_INVALID')
  }
  return date
}

function dateInTimeZone(value: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value)
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || ''
  return `${read('year')}-${read('month')}-${read('day')}`
}

export function countInclusiveDays(beginDate: string, endDate: string): number {
  const begin = parseDateOnly(beginDate)
  const end = parseDateOnly(endDate)
  if (begin.getTime() > end.getTime()) throw new Error('MOBILE_CLOUD_DATE_RANGE_INVALID')
  return Math.floor((end.getTime() - begin.getTime()) / DAY_MS) + 1
}

export function getCalendarDatePreset(days: number, now = new Date(), timeZone = 'Asia/Shanghai') {
  const endDate = dateInTimeZone(now, timeZone)
  const end = parseDateOnly(endDate)
  const begin = new Date(end.getTime() - (Math.max(1, days) - 1) * DAY_MS)
  return { beginDate: begin.toISOString().slice(0, 10), endDate }
}

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000
}

function toDateTime(date: string, end: boolean): string {
  if (!end) return `${date} 00:00:00`
  const nextDay = new Date(parseDateOnly(date).getTime() + DAY_MS).toISOString().slice(0, 10)
  return `${nextDay} 00:00:00`
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10)
}

function rowKey(row: MobileCloudUsageRow): string {
  return `${row.taskId}|${row.deductTime}|${row.totalTokens}|${row.costAmount}`
}

function deduplicateRows(rows: MobileCloudUsageRow[]): MobileCloudUsageRow[] {
  const unique = new Map<string, MobileCloudUsageRow>()
  for (const row of rows) unique.set(rowKey(row), row)
  return [...unique.values()].sort((left, right) => right.deductTime.localeCompare(left.deductTime))
}

function buildSummary(rows: MobileCloudUsageRow[]): MobileCloudUsageSummary {
  return rows.reduce<MobileCloudUsageSummary>((summary, row) => ({
    totalTokens: summary.totalTokens + row.totalTokens,
    costAmount: round(summary.costAmount + row.costAmount),
    videoInputTokens: summary.videoInputTokens + row.videoInputTokens,
    noVideoInputTokens: summary.noVideoInputTokens + row.noVideoInputTokens,
    videoInput1080pTokens: summary.videoInput1080pTokens + row.videoInput1080pTokens,
    noVideoInput1080pTokens: summary.noVideoInput1080pTokens + row.noVideoInput1080pTokens,
  }), {
    totalTokens: 0,
    costAmount: 0,
    videoInputTokens: 0,
    noVideoInputTokens: 0,
    videoInput1080pTokens: 0,
    noVideoInput1080pTokens: 0,
  })
}

function buildTrend(rows: MobileCloudUsageRow[]): MobileCloudUsageTrendPoint[] {
  const totals = new Map<string, { totalTokens: number; costAmount: number }>()
  for (const row of rows) {
    const date = row.deductTime.slice(0, 10)
    const current = totals.get(date) ?? { totalTokens: 0, costAmount: 0 }
    current.totalTokens += row.totalTokens
    current.costAmount = round(current.costAmount + row.costAmount)
    totals.set(date, current)
  }
  return [...totals.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, values]) => ({ date, ...values }))
}

function paginate(rows: MobileCloudUsageRow[], page: number, pageSize: number) {
  const total = rows.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(Math.max(1, page), totalPages)
  const offset = (safePage - 1) * pageSize
  return {
    rows: rows.slice(offset, offset + pageSize),
    pagination: { page: safePage, pageSize, total, totalPages },
  }
}

export function createMobileCloudMaasUsageService(options: UsageServiceOptions = {}) {
  const client = options.client ?? mobileCloudMaasAssetClient
  const now = options.now ?? Date.now

  return {
    async query(query: MobileCloudUsageQuery): Promise<MobileCloudUsageData> {
      const rows: MobileCloudUsageRow[] = []
      const requestedEnd = parseDateOnly(query.endDate)
      let chunkBegin = parseDateOnly(query.beginDate)
      while (chunkBegin.getTime() <= requestedEnd.getTime()) {
        const chunkEnd = new Date(Math.min(
          requestedEnd.getTime(),
          chunkBegin.getTime() + (MAX_QUERY_DAYS - 1) * DAY_MS,
        ))
        let pageNo = 1
        let totalPages = 1
        do {
          const result = await client.queryDeductions({
            pageNo,
            pageSize: 100,
            ...(query.apiKey ? { apiKey: query.apiKey } : {}),
            ...(query.ramName ? { ramName: query.ramName } : {}),
            beginTime: toDateTime(dateOnly(chunkBegin), false),
            endTime: toDateTime(dateOnly(chunkEnd), true),
          })
          rows.push(...result.items)
          totalPages = Math.max(1, Math.ceil(result.total / 100))
          pageNo += 1
        } while (pageNo <= totalPages)
        chunkBegin = new Date(chunkEnd.getTime() + DAY_MS)
      }

      const normalized = deduplicateRows(rows)
      const selected = paginate(normalized, query.page, query.pageSize)
      return {
        modelName: MOBILE_CLOUD_DEDUCTION_MODEL,
        summary: buildSummary(normalized),
        trend: buildTrend(normalized),
        rows: selected.rows,
        pagination: selected.pagination,
        query,
        fetchedAt: new Date(now()).toISOString(),
      }
    },
  }
}

export const mobileCloudMaasUsageService = createMobileCloudMaasUsageService()

export type MobileCloudUsageError = MobileCloudMaasOpenApiError
