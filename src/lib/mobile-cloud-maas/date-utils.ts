/**
 * 移动云 MaaS 日期工具函数（纯函数，无服务端依赖）。
 *
 * 从 usage-service.ts 拆出，避免客户端组件间接引入 node:crypto 依赖链
 * (usage-service → asset-client → signature → node:crypto)。
 */

const DAY_MS = 24 * 60 * 60 * 1000

export function parseDateOnly(value: string): Date {
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
