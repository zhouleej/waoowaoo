export type MobileCloudAssetGroupType = 'AIGC' | 'LivenessFace'
export type MobileCloudAssetType = 'Image' | 'Video' | 'Audio'
export type MobileCloudAssetStatus = 'PROCESSING' | 'ACTIVE' | 'FAILED'
export const MOBILE_CLOUD_DEDUCTION_MODEL = 'AICC-Doubao-Seedance-2.0'

export interface MobileCloudAssetGroup {
  groupId: string
  groupType: MobileCloudAssetGroupType
  groupName: string
  description: string
  assetCount?: number
  createTime?: string
  updateTime?: string
}

export interface MobileCloudAsset {
  assetId: string
  groupId: string
  assetName: string
  assetType: MobileCloudAssetType
  assetUrl: string
  status: MobileCloudAssetStatus
  errorMessage?: string
  createTime?: string
  updateTime?: string
}

export interface MobileCloudPage<T> {
  pageNo: number
  pageSize: number
  total: number
  items: T[]
}

export interface MobileCloudRealPersonSession {
  bytedToken: string
  h5Link: string
  expiresIn: number
}

export interface MobileCloudDeductionRow {
  taskId: string
  userName: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  videoInputTokens: number
  noVideoInputTokens: number
  videoInput1080pTokens: number
  noVideoInput1080pTokens: number
  costAmount: number
  deductTime: string
}

export interface MobileCloudExportTask {
  taskId: string
  status: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED'
  totalRows?: number
  downloadUrl?: string
  errorMessage?: string
}

export interface MobileCloudExportTaskBatch {
  taskIds: string[]
  status: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED'
  totalRows: number
  downloadUrls: string[]
  errorMessage?: string
}
