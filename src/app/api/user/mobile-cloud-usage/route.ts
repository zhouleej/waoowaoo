import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireUserAuth } from '@/lib/api-auth'
import { checkPlatformAdmin } from '@/lib/platform-admin'
import {
  MobileCloudMaasError,
  mobileCloudMaasUsageService,
} from '@/lib/mobile-cloud-maas/client'
import { countInclusiveDays, getCalendarDatePreset } from '@/lib/mobile-cloud-maas/usage'
import type { MobileCloudUsageQuery } from '@/lib/mobile-cloud-maas/types'

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
  const inferenceName = params.get('inferenceName')?.trim() || ''
  const page = positiveInteger(params.get('page'), 1)
  const pageSize = positiveInteger(params.get('pageSize'), 20)
  if (!PAGE_SIZES.has(pageSize)) throw new ApiError('INVALID_PARAMS', { message: 'Invalid page size' })
  if (inferenceName.length > 100) throw new ApiError('INVALID_PARAMS', { message: 'Inference name is too long' })
  try {
    if (countInclusiveDays(beginDate, endDate) > 366) {
      throw new Error('MOBILE_CLOUD_DATE_RANGE_TOO_LONG')
    }
  } catch {
    throw new ApiError('INVALID_PARAMS', { message: 'Invalid date range' })
  }
  return { beginDate, endDate, inferenceName, page, pageSize }
}

async function isCurrentUserPlatformAdmin(): Promise<boolean> {
  const result = await checkPlatformAdmin()
  return !(result instanceof Response) && result.isAdmin
}

function mobileCloudErrorResponse(error: MobileCloudMaasError, isAdmin: boolean): NextResponse {
  const code = error.kind === 'config'
    ? 'MOBILE_CLOUD_CONFIG_MISSING'
    : error.kind === 'auth'
      ? 'MOBILE_CLOUD_SESSION_EXPIRED'
      : 'MOBILE_CLOUD_UNAVAILABLE'
  const message = error.kind === 'config'
    ? '移动云用量尚未配置'
    : error.kind === 'auth'
      ? '移动云控制台会话已失效'
      : '移动云用量暂时不可用'
  const diagnostics = isAdmin
    ? {
        configured: error.kind !== 'config',
        ...(error.kind === 'config' ? { missing: error.missing } : {}),
        ...(error.kind === 'auth' ? { action: 'UPDATE_MOBILE_CLOUD_MAAS_COOKIE' } : {}),
      }
    : undefined
  return NextResponse.json({
    success: false,
    error: { code, message, retryable: error.kind !== 'auth' && error.kind !== 'config' },
    ...(diagnostics ? { diagnostics } : {}),
  }, { status: 503 })
}

export const GET = apiHandler(async (request: NextRequest) => {
  const auth = await requireUserAuth()
  if (isErrorResponse(auth)) return auth
  const query = parseQuery(request)
  const isAdmin = await isCurrentUserPlatformAdmin()
  try {
    const data = await mobileCloudMaasUsageService.query(query)
    return NextResponse.json({
      success: true,
      data,
      ...(isAdmin ? { diagnostics: { configured: true } } : {}),
    })
  } catch (error) {
    if (error instanceof MobileCloudMaasError) return mobileCloudErrorResponse(error, isAdmin)
    throw error
  }
})
