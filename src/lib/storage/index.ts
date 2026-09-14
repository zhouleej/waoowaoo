import { createReadStream, createWriteStream } from 'node:fs'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createScopedLogger } from '@/lib/logging/core'
import { createStorageProvider } from '@/lib/storage/factory'
import type { DeleteObjectsResult, ObjectByteRange, StorageProvider } from '@/lib/storage/types'
import { DEFAULT_SIGNED_URL_EXPIRES_SECONDS, withRetry } from '@/lib/storage/utils'

const storageLogger = createScopedLogger({
  module: 'storage.provider',
})

const UPLOAD_MAX_RETRIES = 3
const RETRY_DELAY_BASE_MS = 2000
const DEFAULT_VIDEO_TRANSFER_TIMEOUT_MS = 10 * 60_000
const DEFAULT_VIDEO_TRANSFER_MAX_BYTES = 2 * 1024 * 1024 * 1024

let providerSingleton: StorageProvider | null = null

export function getStorageProvider(): StorageProvider {
  if (!providerSingleton) {
    providerSingleton = createStorageProvider()
    storageLogger.info(`[Storage] provider initialized: ${providerSingleton.kind}`)
  }
  return providerSingleton
}

export function getStorageType(): string {
  return getStorageProvider().kind
}

export function toFetchableUrl(inputUrl: string): string {
  return getStorageProvider().toFetchableUrl(inputUrl)
}

export function generateUniqueKey(prefix: string, ext: string = 'png'): string {
  return getStorageProvider().generateUniqueKey({ prefix, ext })
}

export async function uploadObject(
  body: Buffer,
  key: string,
  maxRetries: number = UPLOAD_MAX_RETRIES,
  contentType?: string,
): Promise<string> {
  const provider = getStorageProvider()

  const result = await withRetry(
    async () => {
      return await provider.uploadObject({ key, body, contentType })
    },
    maxRetries,
    RETRY_DELAY_BASE_MS,
  )

  return result.key
}

export async function uploadObjectStream(
  body: Readable,
  key: string,
  contentLength: number,
  contentType?: string,
): Promise<string> {
  const result = await getStorageProvider().uploadObjectStream({
    key,
    body,
    contentLength,
    contentType,
  })
  return result.key
}

export async function deleteObject(key: string): Promise<void> {
  await getStorageProvider().deleteObject(key)
}

export async function deleteObjects(keys: string[]): Promise<DeleteObjectsResult> {
  return await getStorageProvider().deleteObjects(keys)
}

export function extractStorageKey(input: string | null | undefined): string | null {
  return getStorageProvider().extractStorageKey(input)
}

export async function getObjectBuffer(key: string): Promise<Buffer> {
  return await getStorageProvider().getObjectBuffer(key)
}

export async function getObjectMetadata(key: string) {
  return await getStorageProvider().getObjectMetadata(key)
}

export async function getObjectStream(key: string, range?: ObjectByteRange) {
  return await getStorageProvider().getObjectStream(key, range)
}

export async function getSignedObjectUrl(
  key: string,
  expiresInSeconds: number = DEFAULT_SIGNED_URL_EXPIRES_SECONDS,
  responseContentDisposition?: string,
): Promise<string> {
  return await getStorageProvider().getSignedObjectUrl({
    key,
    expiresInSeconds,
    responseContentDisposition,
  })
}

export function getSignedUrl(key: string, expiresInSeconds: number = DEFAULT_SIGNED_URL_EXPIRES_SECONDS): string {
  const provider = getStorageProvider()
  if (provider.kind === 'local') {
    return `/api/files/${encodeURIComponent(key)}`
  }

  return `/api/storage/sign?key=${encodeURIComponent(key)}&expires=${encodeURIComponent(String(expiresInSeconds))}`
}

export function getSignedUrls(keys: string[], expiresInSeconds: number = DEFAULT_SIGNED_URL_EXPIRES_SECONDS): string[] {
  return keys.map((key) => getSignedUrl(key, expiresInSeconds))
}

export async function downloadAndUploadImage(
  imageUrl: string,
  key: string,
  maxRetries: number = UPLOAD_MAX_RETRIES,
): Promise<string> {
  const sharp = (await import('sharp')).default

  return await withRetry(async () => {
    const response = await fetch(toFetchableUrl(imageUrl))
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.status} ${response.statusText}`)
    }

    const buffer = Buffer.from(await response.arrayBuffer())
    let processed = await sharp(buffer).jpeg({ quality: 95, mozjpeg: true }).toBuffer()
    let quality = 95
    const maxSizeBytes = 10 * 1024 * 1024

    while (processed.length > maxSizeBytes && quality > 60) {
      quality -= 5
      processed = await sharp(buffer).jpeg({ quality, mozjpeg: true }).toBuffer()
    }

    const jpgKey = key.replace(/\.(png|webp)$/i, '.jpg')
    return await uploadObject(processed, jpgKey, 1, 'image/jpeg')
  }, maxRetries, RETRY_DELAY_BASE_MS)
}

export async function downloadAndUploadVideo(
  videoUrl: string,
  key: string,
  maxRetries: number = UPLOAD_MAX_RETRIES,
  requestHeaders?: Record<string, string>,
): Promise<string> {
  return await withRetry(async () => {
    const transferController = new AbortController()
    const transferTimeout = setTimeout(() => transferController.abort(), DEFAULT_VIDEO_TRANSFER_TIMEOUT_MS)
    const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'wakuwaku-video-'))
    const temporaryFile = path.join(temporaryDirectory, 'source.mp4')
    try {
      const response = await fetch(toFetchableUrl(videoUrl), {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; VideoDownloader/1.0)',
          ...(requestHeaders || {}),
        },
        signal: transferController.signal,
      })
      if (!response.ok) {
        throw new Error(`Failed to download video: ${response.status} ${response.statusText}`)
      }
      if (!response.body) {
        throw new Error('Failed to download video: empty response body')
      }
      const declaredLength = Number(response.headers.get('content-length'))
      if (Number.isFinite(declaredLength) && declaredLength > DEFAULT_VIDEO_TRANSFER_MAX_BYTES) {
        throw new Error('VIDEO_TRANSFER_TOO_LARGE')
      }

      let receivedBytes = 0
      const sizeGuard = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          receivedBytes += chunk.length
          if (receivedBytes > DEFAULT_VIDEO_TRANSFER_MAX_BYTES) {
            callback(new Error('VIDEO_TRANSFER_TOO_LARGE'))
            return
          }
          callback(null, chunk)
        },
      })
      const responseStream = Readable.fromWeb(
        response.body as import('node:stream/web').ReadableStream<Uint8Array>,
      )
      await pipeline(responseStream, sizeGuard, createWriteStream(temporaryFile, { flags: 'wx' }))

      const fileStats = await stat(temporaryFile)
      if (fileStats.size <= 0 || fileStats.size !== receivedBytes) {
        throw new Error('VIDEO_TRANSFER_INCOMPLETE')
      }
      const contentType = response.headers.get('content-type')?.split(';')[0]?.trim() || 'video/mp4'
      return await uploadObjectStream(createReadStream(temporaryFile), key, fileStats.size, contentType)
    } finally {
      clearTimeout(transferTimeout)
      await rm(temporaryDirectory, { recursive: true, force: true })
    }
  }, maxRetries, RETRY_DELAY_BASE_MS)
}

export * from './signed-urls'
export * from './proxy-url'
