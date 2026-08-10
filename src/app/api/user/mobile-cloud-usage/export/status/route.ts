import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireUserAuth } from '@/lib/api-auth'
import { MobileCloudMaasOpenApiError, mobileCloudMaasAssetClient } from '@/lib/mobile-cloud-maas/asset-client'
import { getMobileCloudExportTaskBatchStatus } from '@/lib/mobile-cloud-maas/export-service'
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
  const isAdmin = await isCurrentUserPlatformAdmin()
  try {
    const data = await getMobileCloudExportTaskBatchStatus(mobileCloudMaasAssetClient, taskIds)
    return NextResponse.json({ success: true, data })
  } catch (error) {
    if (error instanceof MobileCloudMaasOpenApiError) return mobileCloudErrorResponse(error, isAdmin)
    throw error
  }
})
