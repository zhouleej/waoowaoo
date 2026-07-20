import type { MobileCloudUsageTrendPoint } from '@/lib/mobile-cloud-maas/types'
import { getCalendarDatePreset } from '@/lib/mobile-cloud-maas/usage'

export function getUsageDatePreset(days: number, now = new Date()): { beginDate: string; endDate: string } {
  return getCalendarDatePreset(days, now)
}

export function buildUsageChartPoints(
  trend: MobileCloudUsageTrendPoint[],
  width: number,
  height: number,
  padding: number,
): Array<{ x: number; y: number }> {
  if (trend.length === 0) return []
  const drawableWidth = Math.max(0, width - padding * 2)
  const drawableHeight = Math.max(0, height - padding * 2)
  const maxValue = Math.max(...trend.map((point) => point.totalTokens), 1)
  return trend.map((point, index) => ({
    x: trend.length === 1 ? width / 2 : padding + (index / (trend.length - 1)) * drawableWidth,
    y: padding + drawableHeight - (point.totalTokens / maxValue) * drawableHeight,
  }))
}

export function normalizeUsagePage(page: number, totalPages: number): number {
  return Math.min(Math.max(1, page), Math.max(1, totalPages))
}
