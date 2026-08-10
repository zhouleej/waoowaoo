import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireUserAuth } from '@/lib/api-auth'
import { MobileCloudMaasOpenApiError, mobileCloudMaasAssetClient } from '@/lib/mobile-cloud-maas/asset-client'
import { advanceMobileCloudExportTaskBatch } from '@/lib/mobile-cloud-maas/export-service'
import type { MobileCloudExportWindow } from '@/lib/mobile-cloud-maas/asset-types'
import { isCurrentUserPlatformAdmin, mobileCloudErrorResponse } from '@/lib/mobile-cloud-maas/route-support'

export const POST = apiHandler(async (request: NextRequest) => {
  const auth = await requireUserAuth()
  if (isErrorResponse(auth)) return auth
  const body = await request.json() as Record<string, unknown>
  const taskIds = Array.isArray(body.taskIds)
    ? body.taskIds.filter((taskId): taskId is string => typeof taskId === 'string').map((taskId) => taskId.trim()).filter(Boolean)
    : []
  if (taskIds.length === 0 || taskIds.length > 400 || taskIds.some((taskId) => taskId.length > 200)) {
    throw new ApiError('INVALID_PARAMS', { message: 'Invalid export task ids' })
  }
  const pendingWindowsRaw = Array.isArray(body.pendingWindows) ? body.pendingWindows : []
  const pendingWindows = pendingWindowsRaw as MobileCloudExportWindow[]
  if (pendingWindows.length > 400 || pendingWindowsRaw.some((window) => {
    if (!window || typeof window !== 'object') return true
    const record = window as Record<string, unknown>
    return typeof record.beginTime !== 'string'
      || typeof record.endTime !== 'string'
      || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(record.beginTime)
      || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(record.endTime)
  })) {
    throw new ApiError('INVALID_PARAMS', { message: 'Invalid pending export windows' })
  }
  const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : ''
  const ramName = typeof body.ramName === 'string' ? body.ramName.trim() : ''
  if (apiKey.length > 200 || ramName.length > 200) throw new ApiError('INVALID_PARAMS')
  const isAdmin = await isCurrentUserPlatformAdmin()
  try {
    const data = await advanceMobileCloudExportTaskBatch(mobileCloudMaasAssetClient, { taskIds, pendingWindows, apiKey, ramName })
    return NextResponse.json({ success: true, data })
  } catch (error) {
    if (error instanceof MobileCloudMaasOpenApiError) return mobileCloudErrorResponse(error, isAdmin)
    throw error
  }
})
