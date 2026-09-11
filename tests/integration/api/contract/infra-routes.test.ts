import fs from 'node:fs/promises'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ROUTE_CATALOG } from '../../../contracts/route-catalog'
import { buildMockRequest } from '../../../helpers/request'

const authState = vi.hoisted(() => ({
  authenticated: false,
}))

const loggingMock = vi.hoisted(() => ({
  readAllLogs: vi.fn(async () => 'worker log line 1\nworker log line 2'),
}))

const storageMock = vi.hoisted(() => ({
  getSignedObjectUrl: vi.fn(async (key: string, ttl: number) => `https://signed.example/${key}?expires=${ttl}`),
  getObjectMetadata: vi.fn(async () => ({
    size: 10,
    contentType: 'application/octet-stream',
    etag: '"video-etag"',
    lastModified: new Date('2026-09-11T05:00:00Z'),
  })),
  getObjectStream: vi.fn(async (_key: string, range?: { start: number; end: number }) => {
    const source = Buffer.from('0123456789')
    const body = range ? source.subarray(range.start, range.end + 1) : source
    return {
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(body)
          controller.close()
        },
      }),
      contentLength: body.length,
    }
  }),
}))

vi.mock('@/lib/api-auth', () => {
  const unauthorized = () => new Response(
    JSON.stringify({ error: { code: 'UNAUTHORIZED' } }),
    { status: 401, headers: { 'content-type': 'application/json' } },
  )

  return {
    isErrorResponse: (value: unknown) => value instanceof Response,
    requireUserAuth: async () => {
      if (!authState.authenticated) return unauthorized()
      return { session: { user: { id: 'user-1' } } }
    },
  }
})

vi.mock('@/lib/platform-admin', async () => {
  const { NextResponse } = await import('next/server')
  return {
    requirePlatformAdmin: async () => {
      if (!authState.authenticated) {
        return NextResponse.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 })
      }
      return { userId: 'user-1' }
    },
  }
})

vi.mock('@/lib/logging/file-writer', () => loggingMock)
vi.mock('@/lib/storage', () => storageMock)

describe('api contract - infra routes (behavior)', () => {
  const routes = ROUTE_CATALOG.filter((entry) => entry.contractGroup === 'infra-routes')
  const originalUploadDir = process.env.UPLOAD_DIR
  const originalStorageProxySecret = process.env.STORAGE_PROXY_SECRET
  const tempState = {
    uploadDirAbs: '',
    uploadDirRel: '',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    authState.authenticated = false
    process.env.STORAGE_PROXY_SECRET = 'storage-proxy-test-secret'
    vi.resetModules()
  })

  afterEach(async () => {
    vi.resetModules()
    if (tempState.uploadDirAbs) {
      await fs.rm(tempState.uploadDirAbs, { recursive: true, force: true })
      tempState.uploadDirAbs = ''
      tempState.uploadDirRel = ''
    }
    if (originalUploadDir === undefined) {
      delete process.env.UPLOAD_DIR
    } else {
      process.env.UPLOAD_DIR = originalUploadDir
    }
    if (originalStorageProxySecret === undefined) {
      delete process.env.STORAGE_PROXY_SECRET
    } else {
      process.env.STORAGE_PROXY_SECRET = originalStorageProxySecret
    }
  })

  async function prepareUploadDir(): Promise<void> {
    const unique = `test-uploads-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    tempState.uploadDirRel = path.join('.tmp', unique)
    tempState.uploadDirAbs = path.join(process.cwd(), tempState.uploadDirRel)
    process.env.UPLOAD_DIR = tempState.uploadDirRel
    await fs.mkdir(tempState.uploadDirAbs, { recursive: true })
  }

  it('infra route group exists', () => {
    expect(routes.map((entry) => entry.routeFile)).toEqual(expect.arrayContaining([
      'src/app/api/admin/download-logs/route.ts',
      'src/app/api/cos/image/route.ts',
      'src/app/api/files/[...path]/route.ts',
      'src/app/api/storage/proxy/route.ts',
      'src/app/api/storage/sign/route.ts',
      'src/app/api/system/boot-id/route.ts',
    ]))
  })

  it('GET /api/admin/download-logs rejects unauthenticated requests', async () => {
    const mod = await import('@/app/api/admin/download-logs/route')
    const req = buildMockRequest({
      path: '/api/admin/download-logs',
      method: 'GET',
    })

    const res = await mod.GET(req, { params: Promise.resolve({}) })
    expect(res.status).toBe(401)
    expect(loggingMock.readAllLogs).not.toHaveBeenCalled()
  })

  it('GET /api/admin/download-logs returns attachment headers when authenticated', async () => {
    authState.authenticated = true
    const mod = await import('@/app/api/admin/download-logs/route')
    const req = buildMockRequest({
      path: '/api/admin/download-logs',
      method: 'GET',
    })

    const res = await mod.GET(req, { params: Promise.resolve({}) })
    const text = await res.text()

    expect(res.status).toBe(200)
    expect(text).toContain('worker log line 1')
    expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8')
    expect(res.headers.get('content-disposition')).toMatch(/^attachment; filename="waoowaoo-logs-/)
  })

  it('GET /api/cos/image redirects to signed storage route with normalized query', async () => {
    const mod = await import('@/app/api/cos/image/route')
    const req = buildMockRequest({
      path: '/api/cos/image?key=folder/a.png&expires=7200',
      method: 'GET',
    })

    const res = await mod.GET(req, { params: Promise.resolve({}) })

    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('http://localhost:3000/api/storage/sign?key=folder%2Fa.png&expires=7200')
  })

  it('GET /api/storage/sign redirects to signed object url with default ttl', async () => {
    const mod = await import('@/app/api/storage/sign/route')
    const req = buildMockRequest({
      path: '/api/storage/sign?key=folder/a.png',
      method: 'GET',
    })

    const res = await mod.GET(req, { params: Promise.resolve({}) })

    expect(storageMock.getSignedObjectUrl).toHaveBeenCalledWith('folder/a.png', 3600)
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('https://signed.example/folder/a.png?expires=3600')
  })

  it('GET /api/storage/proxy serves a signed object through the application origin', async () => {
    const { getStorageProxyUrl } = await import('@/lib/storage/proxy-url')
    const path = getStorageProxyUrl('folder/video.mp4', 600)
    const mod = await import('@/app/api/storage/proxy/route')
    const req = buildMockRequest({ path, method: 'GET' })

    const res = await mod.GET(req, { params: Promise.resolve({}) })

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('video/mp4')
    expect(res.headers.get('accept-ranges')).toBe('bytes')
    expect(await res.text()).toBe('0123456789')
    expect(storageMock.getObjectMetadata).toHaveBeenCalledWith('folder/video.mp4')
    expect(storageMock.getObjectStream).toHaveBeenCalledWith('folder/video.mp4', undefined)
  })

  it('GET /api/storage/proxy supports byte ranges and rejects a tampered signature', async () => {
    const { getStorageProxyUrl } = await import('@/lib/storage/proxy-url')
    const path = getStorageProxyUrl('folder/video.mp4', 600)
    const mod = await import('@/app/api/storage/proxy/route')
    const rangeReq = buildMockRequest({
      path,
      method: 'GET',
      headers: { range: 'bytes=2-5' },
    })

    const rangeRes = await mod.GET(rangeReq, { params: Promise.resolve({}) })
    expect(rangeRes.status).toBe(206)
    expect(rangeRes.headers.get('content-range')).toBe('bytes 2-5/10')
    expect(await rangeRes.text()).toBe('2345')
    expect(storageMock.getObjectStream).toHaveBeenCalledWith('folder/video.mp4', { start: 2, end: 5 })

    const tamperedReq = buildMockRequest({ path: `${path}0`, method: 'GET' })
    const tamperedRes = await mod.GET(tamperedReq, { params: Promise.resolve({}) })
    expect(tamperedRes.status).toBe(403)
  })

  it('HEAD /api/storage/proxy returns media metadata without reading the object body', async () => {
    const { getStorageProxyUrl } = await import('@/lib/storage/proxy-url')
    const path = getStorageProxyUrl('folder/video.mp4', 600)
    const mod = await import('@/app/api/storage/proxy/route')
    const req = buildMockRequest({ path, method: 'HEAD' as 'GET' })

    const res = await mod.HEAD(req, { params: Promise.resolve({}) })

    expect(res.status).toBe(200)
    expect(res.headers.get('content-length')).toBe('10')
    expect(res.headers.get('etag')).toBe('"video-etag"')
    expect(storageMock.getObjectMetadata).toHaveBeenCalledWith('folder/video.mp4')
    expect(storageMock.getObjectStream).not.toHaveBeenCalled()
  })

  it('GET /api/storage/proxy emits a signed UTF-8 attachment filename', async () => {
    const { getStorageDownloadUrl } = await import('@/lib/storage/proxy-url')
    const path = getStorageDownloadUrl('folder/video.mp4', '灵感视频_abc123.mp4', 600)
    const mod = await import('@/app/api/storage/proxy/route')
    const req = buildMockRequest({ path, method: 'GET' })

    const res = await mod.GET(req, { params: Promise.resolve({}) })

    expect(res.status).toBe(200)
    expect(res.headers.get('content-disposition')).toContain('filename*=UTF-8')
    expect(res.headers.get('content-disposition')).toContain('%E7%81%B5%E6%84%9F%E8%A7%86%E9%A2%91_abc123.mp4')
    expect(await res.text()).toBe('0123456789')
  })

  it('GET /api/system/boot-id returns the current server boot id', async () => {
    const mod = await import('@/app/api/system/boot-id/route')
    const serverBoot = await import('@/lib/server-boot')
    const res = await mod.GET()
    const json = await res.json() as { bootId: string }

    expect(res.status).toBe(200)
    expect(json.bootId).toBe(serverBoot.SERVER_BOOT_ID)
    expect(typeof json.bootId).toBe('string')
    expect(json.bootId.length).toBeGreaterThan(0)
  })

  it('GET /api/files/[...path] rejects path traversal attempts', async () => {
    await prepareUploadDir()
    const mod = await import('@/app/api/files/[...path]/route')
    const req = buildMockRequest({
      path: '/api/files/%2E%2E/secret.txt',
      method: 'GET',
    })

    const res = await mod.GET(req, {
      params: Promise.resolve({ path: ['..', 'secret.txt'] }),
    })
    const json = await res.json() as { error: string }

    expect(res.status).toBe(403)
    expect(json.error).toBe('Access denied')
  })

  it('GET /api/files/[...path] returns 404 when the file is missing', async () => {
    await prepareUploadDir()
    const mod = await import('@/app/api/files/[...path]/route')
    const req = buildMockRequest({
      path: '/api/files/missing.txt',
      method: 'GET',
    })

    const res = await mod.GET(req, {
      params: Promise.resolve({ path: ['missing.txt'] }),
    })
    const json = await res.json() as { error: string }

    expect(res.status).toBe(404)
    expect(json.error).toBe('File not found')
  })

  it('GET /api/files/[...path] serves local files from the configured upload dir', async () => {
    await prepareUploadDir()
    const nestedDir = path.join(tempState.uploadDirAbs, 'folder')
    await fs.mkdir(nestedDir, { recursive: true })
    await fs.writeFile(path.join(nestedDir, 'hello.txt'), 'hello local file', 'utf8')

    const mod = await import('@/app/api/files/[...path]/route')
    const req = buildMockRequest({
      path: '/api/files/folder/hello.txt',
      method: 'GET',
    })

    const res = await mod.GET(req, {
      params: Promise.resolve({ path: ['folder', 'hello.txt'] }),
    })
    const text = await res.text()

    expect(res.status).toBe(200)
    expect(text).toBe('hello local file')
    expect(res.headers.get('content-type')).toBe('text/plain')
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000')
  })
})
