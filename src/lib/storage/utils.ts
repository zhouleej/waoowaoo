import { StorageConfigError } from './errors'
import { getInternalBaseUrl } from '@/lib/env'

export const DEFAULT_SIGNED_URL_EXPIRES_SECONDS = 24 * 60 * 60

export function resolveBaseUrl(): string {
  return getInternalBaseUrl()
}

export function toFetchableUrl(inputUrl: string): string {
  if (inputUrl.startsWith('http://') || inputUrl.startsWith('https://') || inputUrl.startsWith('data:')) {
    return inputUrl
  }
  if (inputUrl.startsWith('/')) {
    return `${resolveBaseUrl()}${inputUrl}`
  }
  return inputUrl
}

export function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value || !value.trim()) {
    throw new StorageConfigError(`Missing required environment variable: ${name}`)
  }
  return value.trim()
}

export function validateMinioEndpoint(value: string, name: 'MINIO_ENDPOINT' | 'MINIO_PUBLIC_ENDPOINT'): string {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new StorageConfigError(`${name} must be an absolute http(s) URL`)
  }
  if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || !parsed.hostname) {
    throw new StorageConfigError(`${name} must be an absolute http(s) URL`)
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new StorageConfigError(`${name} must not contain credentials, query parameters, or fragments`)
  }
  if (parsed.pathname !== '/' && parsed.pathname !== '') {
    throw new StorageConfigError(`${name} path prefixes are not supported by the AWS S3 SDK; use a root endpoint`)
  }
  if (parsed.port === '9001') {
    throw new StorageConfigError(`${name} uses port 9001, which is the default MinIO Console port; configure the confirmed public S3 API endpoint (default port 9000) instead`)
  }
  return parsed.toString().replace(/\/$/, '')
}

export function validateMinioBucket(value: string): string {
  if (value.length < 3 || value.length > 63 || !/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(value) || value.includes('..')) {
    throw new StorageConfigError('MINIO_BUCKET must be a valid S3 bucket name (3-63 lowercase letters, numbers, dots, or hyphens)')
  }
  return value
}

export function validateMinioCredential(value: string, name: 'MINIO_ACCESS_KEY' | 'MINIO_SECRET_KEY'): string {
  if (/\s|[\u0000-\u001f\u007f]/.test(value)) {
    throw new StorageConfigError(`${name} must not contain whitespace or control characters`)
  }
  return value
}

export function isHttpUrl(value: string): boolean {
  return value.startsWith('http://') || value.startsWith('https://')
}

export function normalizeKey(raw: string): string {
  return raw.replace(/^\/+/, '')
}

export async function withRetry<T>(
  action: () => Promise<T>,
  maxRetries: number,
  delayBaseMs: number,
): Promise<T> {
  let lastError: unknown = null

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      return await action()
    } catch (error: unknown) {
      lastError = error
      if (attempt === maxRetries) break
      const delayMs = delayBaseMs * Math.pow(2, attempt - 1)
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }

  throw lastError ?? new Error('Unknown retry failure')
}

export async function streamToBuffer(body: unknown): Promise<Buffer> {
  if (!body) {
    throw new Error('Empty response body from storage provider')
  }
  if (body instanceof Uint8Array) {
    return Buffer.from(body)
  }
  if (typeof body === 'string') {
    return Buffer.from(body)
  }

  const chunks: Buffer[] = []
  for await (const chunk of body as AsyncIterable<unknown>) {
    if (Buffer.isBuffer(chunk)) {
      chunks.push(chunk)
      continue
    }
    if (chunk instanceof Uint8Array) {
      chunks.push(Buffer.from(chunk))
      continue
    }
    chunks.push(Buffer.from(String(chunk)))
  }

  return Buffer.concat(chunks)
}
