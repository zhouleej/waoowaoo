import { Readable } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  uploaded: Buffer.alloc(0),
  uploadObjectStream: vi.fn(async (params: {
    key: string
    body: Readable
    contentLength: number
    contentType?: string
  }) => {
    const chunks: Buffer[] = []
    for await (const chunk of params.body) chunks.push(Buffer.from(chunk))
    state.uploaded = Buffer.concat(chunks)
    return { key: params.key }
  }),
}))

vi.mock('@/lib/storage/factory', () => ({
  createStorageProvider: () => ({
    kind: 'minio',
    toFetchableUrl: (value: string) => value,
    uploadObjectStream: state.uploadObjectStream,
  }),
}))
vi.mock('@/lib/logging/core', () => ({
  createScopedLogger: () => ({ info: vi.fn() }),
}))

import { downloadAndUploadVideo } from '@/lib/storage'

describe('video storage transfer', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
    state.uploaded = Buffer.alloc(0)
  })

  it('spools the response and uploads a bounded stream instead of a full-memory buffer', async () => {
    const fetchMock = vi.fn(async () => new Response(Buffer.from('video-data'), {
      status: 200,
      headers: {
        'content-length': '10',
        'content-type': 'video/mp4',
      },
    }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(downloadAndUploadVideo(
      'https://provider.example/video.mp4',
      'images/result.mp4',
      1,
      { Authorization: 'Bearer token' },
    )).resolves.toBe('images/result.mp4')

    expect(state.uploadObjectStream).toHaveBeenCalledWith(expect.objectContaining({
      key: 'images/result.mp4',
      contentLength: 10,
      contentType: 'video/mp4',
      body: expect.any(Readable),
    }))
    expect(state.uploaded.toString()).toBe('video-data')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://provider.example/video.mp4',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer token' }),
        signal: expect.any(AbortSignal),
      }),
    )
  })
})
