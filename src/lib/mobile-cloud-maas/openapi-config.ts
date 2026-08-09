export const MOBILE_CLOUD_MAAS_OPENAPI_REQUIRED_ENV = [
  'MOBILE_CLOUD_MAAS_ACCESS_KEY',
  'MOBILE_CLOUD_MAAS_SECRET_KEY',
] as const

export interface MobileCloudMaasOpenApiConfig {
  baseUrl: string
  accessKey: string
  secretKey: string
  poolId: string
  deductionModel: string
}

export type MobileCloudMaasOpenApiConfigResult =
  | { configured: true; missing: []; config: MobileCloudMaasOpenApiConfig }
  | { configured: false; missing: string[] }

function text(env: Record<string, string | undefined>, key: string): string {
  return env[key]?.trim() || ''
}

export function readMobileCloudMaasOpenApiConfig(
  env: Record<string, string | undefined> = process.env,
): MobileCloudMaasOpenApiConfigResult {
  const accessKey = text(env, 'MOBILE_CLOUD_MAAS_ACCESS_KEY')
  const secretKey = text(env, 'MOBILE_CLOUD_MAAS_SECRET_KEY')
  const missing: string[] = []
  if (!accessKey) missing.push('MOBILE_CLOUD_MAAS_ACCESS_KEY')
  if (!secretKey) missing.push('MOBILE_CLOUD_MAAS_SECRET_KEY')
  if (missing.length > 0) return { configured: false, missing }

  const rawBaseUrl = text(env, 'MOBILE_CLOUD_MAAS_BASE_URL') || 'https://ecloud.10086.cn'
  let baseUrl: string
  try {
    const parsed = new URL(rawBaseUrl)
    if (parsed.protocol !== 'https:') throw new Error('invalid protocol')
    baseUrl = parsed.toString().replace(/\/+$/, '')
  } catch {
    return { configured: false, missing: ['MOBILE_CLOUD_MAAS_BASE_URL'] }
  }

  return {
    configured: true,
    missing: [],
    config: {
      baseUrl,
      accessKey,
      secretKey,
      poolId: text(env, 'MOBILE_CLOUD_MAAS_POOL_ID') || 'CIDC-CORE-00',
      deductionModel: text(env, 'MOBILE_CLOUD_MAAS_DEDUCTION_MODEL') || 'AICC-Doubao-Seedance-2.0',
    },
  }
}
