import fs from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import type {
  DeleteObjectsResult,
  ObjectByteRange,
  SignedUrlParams,
  StorageObjectMetadata,
  StorageObjectStream,
  StorageProvider,
  UploadObjectParams,
  UploadObjectResult,
} from '@/lib/storage/types'
import { normalizeKey, toFetchableUrl } from '@/lib/storage/utils'

const UPLOAD_DIR = process.env.UPLOAD_DIR || './data/uploads'

function resolveUploadPath(key: string): string {
  return path.join(process.cwd(), UPLOAD_DIR, normalizeKey(key))
}

export class LocalStorageProvider implements StorageProvider {
  readonly kind = 'local' as const

  async uploadObject(params: UploadObjectParams): Promise<UploadObjectResult> {
    const normalizedKey = normalizeKey(params.key)
    const filePath = resolveUploadPath(normalizedKey)
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, params.body)
    return { key: normalizedKey }
  }

  async deleteObject(key: string): Promise<void> {
    try {
      await fs.unlink(resolveUploadPath(key))
    } catch (error: unknown) {
      const code = (error as { code?: string })?.code
      if (code !== 'ENOENT') {
        throw error
      }
    }
  }

  async deleteObjects(keys: string[]): Promise<DeleteObjectsResult> {
    const validKeys = keys.filter((key) => typeof key === 'string' && key.trim().length > 0)
    let success = 0
    let failed = 0

    for (const key of validKeys) {
      try {
        await this.deleteObject(key)
        success += 1
      } catch {
        failed += 1
      }
    }

    return { success, failed }
  }

  async getSignedObjectUrl(params: SignedUrlParams): Promise<string> {
    void params.expiresInSeconds
    return `/api/files/${encodeURIComponent(normalizeKey(params.key))}`
  }

  async getObjectBuffer(key: string): Promise<Buffer> {
    return await fs.readFile(resolveUploadPath(key))
  }

  async getObjectMetadata(key: string): Promise<StorageObjectMetadata> {
    const stats = await fs.stat(resolveUploadPath(key))
    return {
      size: stats.size,
      etag: `W/\"${stats.size.toString(16)}-${Math.trunc(stats.mtimeMs).toString(16)}\"`,
      lastModified: stats.mtime,
    }
  }

  async getObjectStream(key: string, range?: ObjectByteRange): Promise<StorageObjectStream> {
    const filePath = resolveUploadPath(key)
    const stats = await fs.stat(filePath)
    const nodeStream = createReadStream(filePath, range ? { start: range.start, end: range.end } : undefined)
    return {
      body: Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>,
      contentLength: range ? range.end - range.start + 1 : stats.size,
      etag: `W/\"${stats.size.toString(16)}-${Math.trunc(stats.mtimeMs).toString(16)}\"`,
      lastModified: stats.mtime,
    }
  }

  extractStorageKey(input: string | null | undefined): string | null {
    if (!input) return null
    if (input.startsWith('/api/files/')) {
      return normalizeKey(decodeURIComponent(input.replace('/api/files/', '')))
    }
    if (!input.startsWith('http') && !input.startsWith('/')) {
      return normalizeKey(input)
    }

    try {
      const parsed = new URL(input)
      return normalizeKey(parsed.pathname)
    } catch {
      return null
    }
  }

  toFetchableUrl(inputUrl: string): string {
    return toFetchableUrl(inputUrl)
  }

  generateUniqueKey(params: { prefix: string; ext: string }): string {
    const timestamp = Date.now()
    const random = Math.random().toString(36).slice(2, 8)
    return `images/${params.prefix}-${timestamp}-${random}.${params.ext}`
  }
}
