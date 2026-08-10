import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireUserAuth } from '@/lib/api-auth'
import { MobileCloudMaasOpenApiError } from '@/lib/mobile-cloud-maas/asset-client'
import { countInclusiveDays, getCalendarDatePreset, mobileCloudMaasUsageService } from '@/lib/mobile-cloud-maas/usage-service'
import type { MobileCloudUsageQuery } from '@/lib/mobile-cloud-maas/types'
import { isCurrentUserPlatformAdmin, mobileCloudErrorResponse } from '@/lib/mobile-cloud-maas/route-support'

const PAGE_SIZES = new Set([10, 20, 50])

function positiveInteger(value: string | null, fallback: number): number {
  if (value === null || value === '') return fallback
  if (!/^\d+$/.test(value)) throw new ApiError('INVALID_PARAMS', { message: 'Invalid pagination' })
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new ApiError('INVALID_PARAMS', { message: 'Invalid pagination' })
  }
  return parsed
}

function parseQuery(request: NextRequest): MobileCloudUsageQuery {
  const params = request.nextUrl.searchParams
  const defaultRange = getCalendarDatePreset(30)
  const beginDate = params.get('beginDate')?.trim() || defaultRange.beginDate
  const endDate = params.get('endDate')?.trim() || defaultRange.endDate
  const apiKey = params.get('apiKey')?.trim() || ''
  const ramName = params.get('ramName')?.trim() || ''
  const page = positiveInteger(params.get('page'), 1)
  const pageSize = positiveInteger(params.get('pageSize'), 20)
  if (!PAGE_SIZES.has(pageSize)) throw new ApiError('INVALID_PARAMS', { message: 'Invalid page size' })
  if (apiKey.length > 200 || ramName.length > 200) throw new ApiError('INVALID_PARAMS', { message: 'Credential filter is too long' })
  try {
    if (countInclusiveDays(beginDate, endDate) > 366) {
      throw new Error('MOBILE_CLOUD_DATE_RANGE_TOO_LONG')
    }
  } catch {
    throw new ApiError('INVALID_PARAMS', { message: 'Invalid date range' })
  }
  return { beginDate, endDate, apiKey, ramName, page, pageSize }
}

export const GET = apiHandler(async (request: NextRequest) => {
  const auth = await requireUserAuth()
  if (isErrorResponse(auth)) return auth
  const isAdmin = await isCurrentUserPlatformAdmin()
  try {
    const query = parseQuery(request)
    const data = await mobileCloudMaasUsageService.query(query)
    return NextResponse.json({
      success: true,
      data,
      ...(isAdmin ? { diagnostics: { configured: true } } : {}),
    })
  } catch (error) {
    if (error instanceof MobileCloudMaasOpenApiError) return mobileCloudErrorResponse(error, isAdmin)
    throw error
  }
})
