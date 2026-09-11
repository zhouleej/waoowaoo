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
import { requireEnv, streamToBuffer, toFetchableUrl, validateMinioBucket, validateMinioCredential, validateMinioEndpoint } from '@/lib/storage/utils'

const DEFAULT_MINIO_REGION = 'us-east-1'

type S3ClientLike = {
  send(command: unknown): Promise<unknown>
}

type S3SdkModule = {
  S3Client: new (config: Record<string, unknown>) => S3ClientLike
  PutObjectCommand: new (input: Record<string, unknown>) => unknown
  DeleteObjectCommand: new (input: Record<string, unknown>) => unknown
  DeleteObjectsCommand: new (input: Record<string, unknown>) => unknown
  GetObjectCommand: new (input: Record<string, unknown>) => unknown
  HeadObjectCommand: new (input: Record<string, unknown>) => unknown
}

type PresignerModule = {
  getSignedUrl: (client: S3ClientLike, command: unknown, options: { expiresIn: number }) => Promise<string>
}

function toWebStream(body: unknown): ReadableStream<Uint8Array> {
  if (body && typeof body === 'object') {
    const sdkBody = body as {
      transformToWebStream?: () => ReadableStream<Uint8Array>
      pipe?: (...args: unknown[]) => unknown
    }
    if (typeof sdkBody.transformToWebStream === 'function') return sdkBody.transformToWebStream()
    if (typeof sdkBody.pipe === 'function') {
      return Readable.toWeb(body as Readable) as ReadableStream<Uint8Array>
    }
  }
  if (body instanceof Uint8Array) {
    return new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(body)
        controller.close()
      },
    })
  }
  throw new Error('STORAGE_OBJECT_BODY_UNREADABLE')
}

export class MinioStorageProvider implements StorageProvider {
  readonly kind = 'minio' as const

  private readonly bucket: string
  private readonly endpoint: string
  private readonly publicEndpoint: string
  private readonly region: string
  private readonly forcePathStyle: boolean
  private readonly accessKeyId: string
  private readonly secretAccessKey: string
  private clientPromise: Promise<S3ClientLike> | null = null
  private signingClientPromise: Promise<S3ClientLike> | null = null

  constructor() {
    this.endpoint = validateMinioEndpoint(requireEnv('MINIO_ENDPOINT'), 'MINIO_ENDPOINT')
    const configuredPublicEndpoint = process.env.MINIO_PUBLIC_ENDPOINT?.trim()
    this.publicEndpoint = configuredPublicEndpoint
      ? validateMinioEndpoint(configuredPublicEndpoint, 'MINIO_PUBLIC_ENDPOINT')
      : this.endpoint
    this.accessKeyId = validateMinioCredential(requireEnv('MINIO_ACCESS_KEY'), 'MINIO_ACCESS_KEY')
    this.secretAccessKey = validateMinioCredential(requireEnv('MINIO_SECRET_KEY'), 'MINIO_SECRET_KEY')
    this.bucket = validateMinioBucket(requireEnv('MINIO_BUCKET'))
    this.region = process.env.MINIO_REGION || DEFAULT_MINIO_REGION
    this.forcePathStyle = process.env.MINIO_FORCE_PATH_STYLE !== 'false'
  }

  private async loadSdk(): Promise<S3SdkModule> {
    return await import('@aws-sdk/client-s3') as unknown as S3SdkModule
  }

  private async loadPresigner(): Promise<PresignerModule> {
    return await import('@aws-sdk/s3-request-presigner') as unknown as PresignerModule
  }

  private async createClient(endpoint: string): Promise<S3ClientLike> {
    const { S3Client } = await this.loadSdk()
    return new S3Client({
      endpoint,
      region: this.region,
      forcePathStyle: this.forcePathStyle,
      credentials: {
        accessKeyId: this.accessKeyId,
        secretAccessKey: this.secretAccessKey,
      },
    })
  }

  private async getClient(): Promise<S3ClientLike> {
    if (!this.clientPromise) {
      this.clientPromise = this.createClient(this.endpoint)
    }
    return await this.clientPromise
  }

  private async getSigningClient(): Promise<S3ClientLike> {
    if (!this.signingClientPromise) {
      this.signingClientPromise = this.publicEndpoint === this.endpoint
        ? this.getClient()
        : this.createClient(this.publicEndpoint)
    }
    return await this.signingClientPromise
  }

  async uploadObject(params: UploadObjectParams): Promise<UploadObjectResult> {
    const sdk = await this.loadSdk()
    const client = await this.getClient()
    await client.send(new sdk.PutObjectCommand({
      Bucket: this.bucket,
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
    }))

    return { key: params.key }
  }

  async deleteObject(key: string): Promise<void> {
    const sdk = await this.loadSdk()
    const client = await this.getClient()
    await client.send(new sdk.DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    }))
  }

  async deleteObjects(keys: string[]): Promise<DeleteObjectsResult> {
    const validKeys = keys.filter((key) => typeof key === 'string' && key.trim().length > 0)
    if (validKeys.length === 0) {
      return { success: 0, failed: 0 }
    }

    const sdk = await this.loadSdk()
    const client = await this.getClient()
    const result = await client.send(new sdk.DeleteObjectsCommand({
      Bucket: this.bucket,
      Delete: {
        Objects: validKeys.map((key) => ({ Key: key })),
      },
    })) as { Deleted?: unknown[]; Errors?: unknown[] }

    return {
      success: result.Deleted?.length ?? 0,
      failed: result.Errors?.length ?? 0,
    }
  }

  async getSignedObjectUrl(params: SignedUrlParams): Promise<string> {
    const sdk = await this.loadSdk()
    const presigner = await this.loadPresigner()
    const client = await this.getSigningClient()

    return await presigner.getSignedUrl(
      client,
      new sdk.GetObjectCommand({
        Bucket: this.bucket,
        Key: params.key,
      }),
      {
        expiresIn: params.expiresInSeconds,
      },
    )
  }

  async getObjectBuffer(key: string): Promise<Buffer> {
    const sdk = await this.loadSdk()
    const client = await this.getClient()
    const result = await client.send(new sdk.GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    })) as { Body?: unknown }
    return await streamToBuffer(result.Body)
  }

  async getObjectMetadata(key: string): Promise<StorageObjectMetadata> {
    const sdk = await this.loadSdk()
    const client = await this.getClient()
    const result = await client.send(new sdk.HeadObjectCommand({
      Bucket: this.bucket,
      Key: key,
    })) as {
      ContentLength?: number
      ContentType?: string
      ETag?: string
      LastModified?: Date
    }
    if (!Number.isSafeInteger(result.ContentLength) || (result.ContentLength ?? -1) < 0) {
      throw new Error('STORAGE_OBJECT_SIZE_INVALID')
    }
    return {
      size: result.ContentLength as number,
      contentType: result.ContentType,
      etag: result.ETag,
      lastModified: result.LastModified,
    }
  }

  async getObjectStream(key: string, range?: ObjectByteRange): Promise<StorageObjectStream> {
    const sdk = await this.loadSdk()
    const client = await this.getClient()
    const result = await client.send(new sdk.GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ...(range ? { Range: `bytes=${range.start}-${range.end}` } : {}),
    })) as {
      Body?: unknown
      ContentLength?: number
      ContentType?: string
      ETag?: string
      LastModified?: Date
    }
    const expectedLength = range ? range.end - range.start + 1 : result.ContentLength
    if (!Number.isSafeInteger(expectedLength) || (expectedLength ?? -1) < 0) {
      throw new Error('STORAGE_OBJECT_STREAM_SIZE_INVALID')
    }
    return {
      body: toWebStream(result.Body),
      contentLength: expectedLength as number,
      contentType: result.ContentType,
      etag: result.ETag,
      lastModified: result.LastModified,
    }
  }

  extractStorageKey(input: string | null | undefined): string | null {
    if (!input) return null

    if (!input.startsWith('http') && !input.startsWith('/')) {
      return input
    }

    try {
      const parsed = new URL(input)
      let pathname = parsed.pathname.replace(/^\/+/, '')
      const bucketPrefix = `${this.bucket}/`
      if (pathname.startsWith(bucketPrefix)) {
        pathname = pathname.slice(bucketPrefix.length)
      }
      if (parsed.hostname.startsWith(`${this.bucket}.`) && pathname) {
        return pathname
      }
      return pathname || null
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
