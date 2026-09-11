export type StorageType = 'minio' | 'local' | 'cos'

export interface UploadObjectParams {
  key: string
  body: Buffer
  contentType?: string
}

export interface UploadObjectResult {
  key: string
}

export interface DeleteObjectsResult {
  success: number
  failed: number
}

export interface SignedUrlParams {
  key: string
  expiresInSeconds: number
}

export type ObjectByteRange = {
  start: number
  end: number
}

export type StorageObjectMetadata = {
  size: number
  contentType?: string
  etag?: string
  lastModified?: Date
}

export type StorageObjectStream = {
  body: ReadableStream<Uint8Array>
  contentLength: number
  contentType?: string
  etag?: string
  lastModified?: Date
}

export interface StorageProvider {
  readonly kind: StorageType
  uploadObject(params: UploadObjectParams): Promise<UploadObjectResult>
  deleteObject(key: string): Promise<void>
  deleteObjects(keys: string[]): Promise<DeleteObjectsResult>
  getSignedObjectUrl(params: SignedUrlParams): Promise<string>
  getObjectBuffer(key: string): Promise<Buffer>
  getObjectMetadata(key: string): Promise<StorageObjectMetadata>
  getObjectStream(key: string, range?: ObjectByteRange): Promise<StorageObjectStream>
  extractStorageKey(input: string | null | undefined): string | null
  toFetchableUrl(inputUrl: string): string
  generateUniqueKey(params: { prefix: string; ext: string }): string
}

export interface StorageFactoryOptions {
  storageType?: string
}
