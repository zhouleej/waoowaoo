import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireUserAuth } from '@/lib/api-auth'
import { MobileCloudMaasOpenApiError, mobileCloudMaasAssetClient } from '@/lib/mobile-cloud-maas/asset-client'
import { createMobileCloudExportTaskBatch } from '@/lib/mobile-cloud-maas/export-service'
import { countInclusiveDays } from '@/lib/mobile-cloud-maas/usage-service'
import { isCurrentUserPlatformAdmin, mobileCloudErrorResponse } from '@/lib/mobile-cloud-maas/route-support'

export const POST = apiHandler(async (request: NextRequest) => {
  const auth = await requireUserAuth()
  if (isErrorResponse(auth)) return auth
  const body = await request.json() as Record<string, unknown>
  const beginDate = typeof body.beginDate === 'string' ? body.beginDate.trim() : ''
  const endDate = typeof body.endDate === 'string' ? body.endDate.trim() : ''
  if (!beginDate || !endDate) throw new ApiError('INVALID_PARAMS')
  try {
    if (countInclusiveDays(beginDate, endDate) > 366) throw new Error('MOBILE_CLOUD_DATE_RANGE_TOO_LONG')
  } catch {
    throw new ApiError('INVALID_PARAMS', { message: 'Invalid date range' })
  }
  const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : ''
  const ramName = typeof body.ramName === 'string' ? body.ramName.trim() : ''
  if (apiKey.length > 200 || ramName.length > 200) throw new ApiError('INVALID_PARAMS')
  const isAdmin = await isCurrentUserPlatformAdmin()
  try {
    const data = await createMobileCloudExportTaskBatch(mobileCloudMaasAssetClient, { beginDate, endDate, apiKey, ramName })
    return NextResponse.json({ success: true, data }, { status: 202 })
  } catch (error) {
    if (error instanceof MobileCloudMaasOpenApiError) return mobileCloudErrorResponse(error, isAdmin)
    throw error
  }
})
