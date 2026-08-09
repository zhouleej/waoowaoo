import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireUserAuth } from '@/lib/api-auth'
import { checkPlatformAdmin } from '@/lib/platform-admin'
import {
  MobileCloudMaasOpenApiError,
  mobileCloudMaasAssetClient,
} from '@/lib/mobile-cloud-maas/asset-client'
import { countInclusiveDays, getCalendarDatePreset, mobileCloudMaasUsageService } from '@/lib/mobile-cloud-maas/usage-service'
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

async function isCurrentUserPlatformAdmin(): Promise<boolean> {
  const result = await checkPlatformAdmin()
  return !(result instanceof Response) && result.isAdmin
}

function mobileCloudErrorResponse(error: MobileCloudMaasOpenApiError, isAdmin: boolean): NextResponse {
  const code = error.kind === 'config'
    ? 'MOBILE_CLOUD_OPENAPI_CONFIG_MISSING'
    : error.kind === 'auth'
      ? 'MOBILE_CLOUD_OPENAPI_AUTH_FAILED'
      : 'MOBILE_CLOUD_OPENAPI_UNAVAILABLE'
  const message = error.kind === 'config'
    ? '移动云 OpenAPI 密钥尚未配置'
    : error.kind === 'auth'
      ? '移动云 OpenAPI 鉴权失败'
      : '移动云资费接口暂时不可用'
  const diagnostics = isAdmin
    ? {
        configured: error.kind !== 'config',
        ...(error.kind === 'config' ? { missing: error.missing } : {}),
        ...(error.kind === 'auth' ? { action: 'CHECK_MOBILE_CLOUD_MAAS_ACCESS_KEY' } : {}),
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
  const isAdmin = await isCurrentUserPlatformAdmin()
  try {
    const exportTaskId = request.nextUrl.searchParams.get('exportTaskId')?.trim()
    if (exportTaskId) {
      const data = await mobileCloudMaasAssetClient.getDeductionExportTask(exportTaskId)
      return NextResponse.json({ success: true, data })
    }
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
    const data = await mobileCloudMaasAssetClient.createDeductionExportTask({
      beginTime: `${beginDate} 00:00:00`,
      endTime: `${new Date(Date.parse(`${endDate}T00:00:00Z`) + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)} 00:00:00`,
      ...(apiKey ? { apiKey } : {}),
      ...(ramName ? { ramName } : {}),
    })
    return NextResponse.json({ success: true, data }, { status: 202 })
  } catch (error) {
    if (error instanceof MobileCloudMaasOpenApiError) return mobileCloudErrorResponse(error, isAdmin)
    throw error
  }
})
