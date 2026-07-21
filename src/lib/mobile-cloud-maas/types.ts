export interface MobileCloudUsageRow {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  useTime: string
  inferenceId: string
  inferenceName: string
  domainType: string | null
  promptUsageAmount: number
  completionUsageAmount: number
  totalUsageAmount: number
}

export interface MobileCloudPackageRow {
  instanceId: string
  poolId: string
  poolName: string
  chaGroupName: string
  resourceStatus: string
  productOrderNum: number
  effectTime: string
  expireTime: string
  totalResourcePoint: number | null
  remainingResourcePoint: number | null
}

export interface MobileCloudPackageSummary {
  instanceId: string
  poolId: string
  poolName: string
  packageName: string
  status: string
  productOrderNum: number
  effectTime: string
  expireTime: string
  totalTokens: number | null
  usedTokens: number | null
  remainingTokens: number | null
  usedPercent: number | null
}

export interface MobileCloudUsageTrendPoint {
  date: string
  totalTokens: number
  totalUsageAmount: number
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
  inferenceName: string
  page: number
  pageSize: number
}

export interface MobileCloudUsageData {
  package: MobileCloudPackageSummary
  trend: MobileCloudUsageTrendPoint[]
  rows: MobileCloudUsageRow[]
  pagination: MobileCloudUsagePagination
  query: MobileCloudUsageQuery
  fetchedAt: string
  cached: boolean
  stale: boolean
}

export interface MobileCloudUpstreamList<T> {
  totalSize: number
  dataRows: T[]
}
