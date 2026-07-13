import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MinioStorageProvider } from '@/lib/storage/providers/minio'
import { StorageConfigError } from '@/lib/storage/errors'

const { s3ClientMock, getSignedUrlMock } = vi.hoisted(() => ({
  s3ClientMock: vi.fn(function S3Client(config: Record<string, unknown>) {
    return { config, send: vi.fn() }
  }),
  getSignedUrlMock: vi.fn(async (client: { config: { endpoint: string } }) => (
    `${client.config.endpoint}/waoowaoo/images/test.png?X-Amz-Signature=test`
  )),
}))

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: s3ClientMock,
  GetObjectCommand: vi.fn(function GetObjectCommand(input: Record<string, unknown>) { return input }),
  PutObjectCommand: vi.fn(),
  DeleteObjectCommand: vi.fn(),
  DeleteObjectsCommand: vi.fn(),
}))

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: getSignedUrlMock,
}))

describe('MinioStorageProvider signing endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.MINIO_ENDPOINT = 'http://minio:9000'
    process.env.MINIO_PUBLIC_ENDPOINT = 'https://s3.example.com'
    process.env.MINIO_REGION = 'us-east-1'
    process.env.MINIO_BUCKET = 'waoowaoo'
    process.env.MINIO_ACCESS_KEY = 'app-access-key'
    process.env.MINIO_SECRET_KEY = 'app-secret-key'
    process.env.MINIO_FORCE_PATH_STYLE = 'true'
  })

  afterEach(() => {
    delete process.env.MINIO_PUBLIC_ENDPOINT
  })

  it('uses the public endpoint client to create a host-correct presigned URL', async () => {
    const provider = new MinioStorageProvider()
    const url = await provider.getSignedObjectUrl({ key: 'images/test.png', expiresInSeconds: 3600 })

    expect(new URL(url).host).toBe('s3.example.com')
    expect(s3ClientMock).toHaveBeenCalledWith(expect.objectContaining({ endpoint: 'https://s3.example.com' }))
  })

  it('keeps backward compatibility by signing with the internal endpoint when public endpoint is absent', async () => {
    delete process.env.MINIO_PUBLIC_ENDPOINT
    const provider = new MinioStorageProvider()
    const url = await provider.getSignedObjectUrl({ key: 'images/test.png', expiresInSeconds: 3600 })

    expect(new URL(url).host).toBe('minio:9000')
  })

  it('rejects the conventional MinIO Console port for either S3 endpoint', () => {
    process.env.MINIO_PUBLIC_ENDPOINT = 'http://storage.example.com:9001'
    expect(() => new MinioStorageProvider()).toThrow(StorageConfigError)
    expect(() => new MinioStorageProvider()).toThrow(/Console port/)
  })
})
