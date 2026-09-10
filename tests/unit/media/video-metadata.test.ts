import { describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ duration: 7.25, save: vi.fn().mockResolvedValue({}) }))
vi.mock('@/lib/storage', () => ({ getObjectBuffer: async () => Buffer.from('video') }))
vi.mock('@/lib/media/service', () => ({ ensureMediaObjectFromStorageKey: state.save }))
vi.mock('@remotion/renderer', () => ({ getVideoMetadata: async () => ({ durationInSeconds: state.duration, width: 1280, height: 720, fps: 24 }) }))
import { inspectGeneratedVideo } from '@/lib/media/video-metadata'
describe('generated video metadata', () => {
  it('persists measured duration rather than requested duration', async () => {
    expect(await inspectGeneratedVideo('video.mp4')).toEqual({ durationMs: 7250, width: 1280, height: 720, fps: 24 })
    expect(state.save).toHaveBeenCalledWith('video.mp4', expect.objectContaining({ durationMs: 7250, sizeBytes: 5 }))
  })
  it('rejects an output without measurable duration', async () => {
    state.duration = 0
    await expect(inspectGeneratedVideo('bad.mp4')).rejects.toThrow('VIDEO_OUTPUT_INVALID')
  })
})
