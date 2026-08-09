import { createHash, createHmac, randomUUID } from 'node:crypto'

export type MobileCloudSignatureMethod = 'HmacSHA1' | 'HmacSHA256'

export interface MobileCloudSignatureInput {
  accessKey: string
  secretKey: string
  method: string
  servletPath: string
  query?: Record<string, string | number | boolean | null | undefined>
  signatureMethod?: MobileCloudSignatureMethod
  now?: number
  nonce?: string
}

export interface MobileCloudSignedQuery {
  params: Record<string, string>
  canonicalQueryString: string
  stringToSign: string
  signature: string
}

/**
 * 移动云 BC-Signature V2.0 的 percentEncode 规则。
 * URLSearchParams 的编码规则不同（空格会编码为 +），不能直接复用。
 */
export function mobileCloudPercentEncode(value: string): string {
  return encodeURIComponent(value)
    .replace(/[!'()]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/\*/g, '%2A')
    .replace(/%7E/g, '~')
}

function normalizeValue(value: string | number | boolean | null | undefined): string | null {
  if (value === null || value === undefined) return null
  return String(value)
}

function formatTimestamp(value: number): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date(value))
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || ''
  return `${read('year')}-${read('month')}-${read('day')}T${read('hour')}:${read('minute')}:${read('second')}Z`
}

function canonicalizeQuery(params: Record<string, string>): string {
  return Object.entries(params)
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => {
      const keyOrder = mobileCloudPercentEncode(leftKey).localeCompare(mobileCloudPercentEncode(rightKey))
      if (keyOrder !== 0) return keyOrder
      return mobileCloudPercentEncode(leftValue).localeCompare(mobileCloudPercentEncode(rightValue))
    })
    .map(([key, value]) => `${mobileCloudPercentEncode(key)}=${mobileCloudPercentEncode(value)}`)
    .join('&')
}

export function buildMobileCloudSignature(input: MobileCloudSignatureInput): MobileCloudSignedQuery {
  const signatureMethod = input.signatureMethod ?? 'HmacSHA1'
  const params: Record<string, string> = {}
  for (const [key, value] of Object.entries(input.query ?? {})) {
    const normalized = normalizeValue(value)
    if (normalized !== null && key !== 'Signature') params[key] = normalized
  }

  params.AccessKey = input.accessKey
  params.Timestamp = formatTimestamp(input.now ?? Date.now())
  params.SignatureMethod = signatureMethod
  params.SignatureVersion = 'V2.0'
  params.SignatureNonce = input.nonce ?? randomUUID()

  const canonicalQueryString = canonicalizeQuery(params)
  const queryHash = createHash('sha256').update(canonicalQueryString, 'utf8').digest('hex')
  const stringToSign = `${input.method.toUpperCase()}\n${mobileCloudPercentEncode(input.servletPath)}\n${queryHash}`
  const digest = signatureMethod === 'HmacSHA256' ? 'sha256' : 'sha1'
  const signature = createHmac(digest, `BC_SIGNATURE&${input.secretKey}`)
    .update(stringToSign, 'utf8')
    .digest('hex')

  return {
    params: { ...params, Signature: signature },
    canonicalQueryString,
    stringToSign,
    signature,
  }
}
