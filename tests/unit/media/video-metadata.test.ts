import { describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({
  duration: 7.25,
  dispose: vi.fn(),
  open: vi.fn(),
  read: vi.fn(async () => ({
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]))
        controller.close()
      },
    }),
  })),
  save: vi.fn().mockResolvedValue({}),
}))
vi.mock('@/lib/storage', () => ({
  getObjectMetadata: async () => ({ size: 5, contentType: 'video/mp4' }),
  getObjectStream: state.read,
}))
vi.mock('@/lib/media/service', () => ({ ensureMediaObjectFromStorageKey: state.save }))
vi.mock('mediabunny', () => ({
  ALL_FORMATS: ['all-formats'],
  StreamSource: class StreamSource {
    constructor(readonly options: Record<string, unknown>) {}
  },
  Input: class Input {
    constructor(options: unknown) {
      state.open(options)
    }

    computeDuration = async () => state.duration
    getPrimaryVideoTrack = async () => ({
      displayWidth: 1280,
      displayHeight: 720,
      computePacketStats: async () => ({ averagePacketRate: 24 }),
    })
    dispose = state.dispose
  },
}))
import { inspectGeneratedVideo } from '@/lib/media/video-metadata'
describe('generated video metadata', () => {
  it('persists measured duration rather than requested duration', async () => {
    expect(await inspectGeneratedVideo('video.mp4')).toEqual({ durationMs: 7250, width: 1280, height: 720, fps: 24 })
    expect(state.save).toHaveBeenCalledWith('video.mp4', expect.objectContaining({ durationMs: 7250, sizeBytes: 5 }))
    expect(state.open).toHaveBeenCalledWith(expect.objectContaining({
      formats: ['all-formats'],
      source: expect.objectContaining({
        options: expect.objectContaining({
          maxCacheSize: 4 * 1024 * 1024,
          prefetchProfile: 'network',
        }),
      }),
    }))
    const source = state.open.mock.calls[0][0].source as {
      options: { getSize: () => number; read: (start: number, end: number) => Promise<unknown> }
    }
    expect(source.options.getSize()).toBe(5)
    await source.options.read(1, 4)
    expect(state.read).toHaveBeenCalledWith('video.mp4', { start: 1, end: 3 })
    expect(state.dispose).toHaveBeenCalledOnce()
  })
  it('rejects an output without measurable duration', async () => {
    state.duration = 0
    await expect(inspectGeneratedVideo('bad.mp4')).rejects.toThrow('VIDEO_OUTPUT_INVALID')
  })
})
