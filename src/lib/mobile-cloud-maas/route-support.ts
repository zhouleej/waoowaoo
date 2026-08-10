import { NextResponse } from 'next/server'
import { checkPlatformAdmin } from '@/lib/platform-admin'
import { MobileCloudMaasOpenApiError } from './asset-client'

export async function isCurrentUserPlatformAdmin(): Promise<boolean> {
  const result = await checkPlatformAdmin()
  return !(result instanceof Response) && result.isAdmin
}

export function mobileCloudErrorResponse(error: MobileCloudMaasOpenApiError, isAdmin: boolean): NextResponse {
  const mainAccountRequired = error.upstreamCode === 'C400999' && error.message.includes('需要主账号')
  const code = error.kind === 'config'
    ? 'MOBILE_CLOUD_OPENAPI_CONFIG_MISSING'
    : error.kind === 'auth'
      ? 'MOBILE_CLOUD_OPENAPI_AUTH_FAILED'
      : isAdmin && mainAccountRequired
        ? 'MOBILE_CLOUD_OPENAPI_MAIN_ACCOUNT_REQUIRED'
        : 'MOBILE_CLOUD_OPENAPI_UNAVAILABLE'
  const message = error.kind === 'config'
    ? '移动云 OpenAPI 密钥尚未配置'
    : error.kind === 'auth'
      ? '移动云 OpenAPI 鉴权失败'
      : isAdmin && mainAccountRequired
        ? '资费明细仅支持移动云主账号，请配置主账号的 AK/SK'
        : '移动云资费接口暂时不可用'
  const diagnostics = isAdmin
    ? {
        configured: error.kind !== 'config',
        ...(error.kind === 'config' ? { missing: error.missing } : {}),
        ...(error.kind === 'auth' ? { action: 'CHECK_MOBILE_CLOUD_MAAS_ACCESS_KEY' } : {}),
        ...(mainAccountRequired ? { action: 'USE_MOBILE_CLOUD_MAIN_ACCOUNT_ACCESS_KEY' } : {}),
        ...(error.upstreamCode ? { upstreamCode: error.upstreamCode } : {}),
      }
    : undefined
  return NextResponse.json({
    success: false,
    error: { code, message, retryable: error.kind !== 'auth' && error.kind !== 'config' },
    ...(diagnostics ? { diagnostics } : {}),
  }, { status: 503 })
}
