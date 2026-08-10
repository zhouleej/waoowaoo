import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireUserAuth } from '@/lib/api-auth'
import { MobileCloudMaasOpenApiError } from '@/lib/mobile-cloud-maas/asset-client'
import { countInclusiveDays, mobileCloudMaasUsageService } from '@/lib/mobile-cloud-maas/usage-service'
import { buildMobileCloudUsageCsv } from '@/lib/mobile-cloud-maas/usage-export'
import { isCurrentUserPlatformAdmin, mobileCloudErrorResponse } from '@/lib/mobile-cloud-maas/route-support'

export const POST = apiHandler(async (request: NextRequest) => {
  const auth = await requireUserAuth()
  if (isErrorResponse(auth)) return auth
  const body = await request.json() as Record<string, unknown>
  const beginDate = typeof body.beginDate === 'string' ? body.beginDate.trim() : ''
  const endDate = typeof body.endDate === 'string' ? body.endDate.trim() : ''
  const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : ''
  const ramName = typeof body.ramName === 'string' ? body.ramName.trim() : ''
  if (!beginDate || !endDate || apiKey.length > 200 || ramName.length > 200) throw new ApiError('INVALID_PARAMS')
  try {
    if (countInclusiveDays(beginDate, endDate) > 366) throw new Error('MOBILE_CLOUD_DATE_RANGE_TOO_LONG')
  } catch {
    throw new ApiError('INVALID_PARAMS', { message: 'Invalid date range' })
  }
  const isAdmin = await isCurrentUserPlatformAdmin()
  try {
    const data = await mobileCloudMaasUsageService.query({ beginDate, endDate, apiKey, ramName, page: 1, pageSize: 100_000 })
    const filename = `mobile-cloud-usage-${beginDate}-${endDate}.csv`
    return new NextResponse(buildMobileCloudUsageCsv(data.rows), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'X-Mobile-Cloud-Usage-Rows': String(data.rows.length),
      },
    })
  } catch (error) {
    if (error instanceof MobileCloudMaasOpenApiError) return mobileCloudErrorResponse(error, isAdmin)
    throw error
  }
})
