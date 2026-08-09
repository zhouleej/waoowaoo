import type { MobileCloudDeductionRow } from './asset-types'

export type MobileCloudUsageRow = MobileCloudDeductionRow

export interface MobileCloudUsageTrendPoint {
  date: string
  totalTokens: number
  costAmount: number
}

export interface MobileCloudUsageSummary {
  totalTokens: number
  costAmount: number
  videoInputTokens: number
  noVideoInputTokens: number
  videoInput1080pTokens: number
  noVideoInput1080pTokens: number
}

export interface MobileCloudUsagePagination {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export interface MobileCloudUsageQuery {
  beginDate: string
  endDate: string
  apiKey: string
  ramName: string
  page: number
  pageSize: number
}

export interface MobileCloudUsageData {
  modelName: string
  summary: MobileCloudUsageSummary
  trend: MobileCloudUsageTrendPoint[]
  rows: MobileCloudUsageRow[]
  pagination: MobileCloudUsagePagination
  query: MobileCloudUsageQuery
  fetchedAt: string
}
