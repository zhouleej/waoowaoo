export const MOBILE_CLOUD_MAAS_REQUIRED_ENV = [
  'MOBILE_CLOUD_MAAS_COOKIE',
  'MOBILE_CLOUD_MAAS_INSTANCE_ID',
  'MOBILE_CLOUD_MAAS_POOL_ID',
  'MOBILE_CLOUD_MAAS_PACKAGE_TOKENS_PER_UNIT',
] as const

export interface MobileCloudMaasConfig {
  baseUrl: string
  cookie: string
  instanceId: string
  poolId: string
  packageTokensPerUnit: number
}

export type MobileCloudMaasConfigResult =
  | { configured: true; missing: []; config: MobileCloudMaasConfig }
  | { configured: false; missing: string[] }

function text(env: Record<string, string | undefined>, key: string): string {
  return env[key]?.trim() || ''
}

export function readMobileCloudMaasConfig(
  env: Record<string, string | undefined> = process.env,
): MobileCloudMaasConfigResult {
  const cookie = text(env, 'MOBILE_CLOUD_MAAS_COOKIE')
  const instanceId = text(env, 'MOBILE_CLOUD_MAAS_INSTANCE_ID')
  const poolId = text(env, 'MOBILE_CLOUD_MAAS_POOL_ID')
  const tokensRaw = text(env, 'MOBILE_CLOUD_MAAS_PACKAGE_TOKENS_PER_UNIT')
  const packageTokensPerUnit = Number(tokensRaw)
  const missing: string[] = []
  if (!cookie) missing.push('MOBILE_CLOUD_MAAS_COOKIE')
  if (!instanceId) missing.push('MOBILE_CLOUD_MAAS_INSTANCE_ID')
  if (!poolId) missing.push('MOBILE_CLOUD_MAAS_POOL_ID')
  if (!tokensRaw || !Number.isFinite(packageTokensPerUnit) || packageTokensPerUnit <= 0) {
    missing.push('MOBILE_CLOUD_MAAS_PACKAGE_TOKENS_PER_UNIT')
  }
  if (missing.length > 0) return { configured: false, missing }

  const rawBaseUrl = text(env, 'MOBILE_CLOUD_MAAS_BASE_URL') || 'https://ecloud.10086.cn'
  let baseUrl: string
  try {
    const parsed = new URL(rawBaseUrl)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error('invalid protocol')
    baseUrl = parsed.toString().replace(/\/+$/, '')
  } catch {
    return { configured: false, missing: ['MOBILE_CLOUD_MAAS_BASE_URL'] }
  }

  return {
    configured: true,
    missing: [],
    config: { baseUrl, cookie, instanceId, poolId, packageTokensPerUnit },
  }
}
