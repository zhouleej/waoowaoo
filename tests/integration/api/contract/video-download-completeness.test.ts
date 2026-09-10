import { describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'
vi.mock('@/lib/api-auth', () => ({ requireProjectAuthLight: async () => ({ project: { name: 'Project' } }), isErrorResponse: () => false }))
vi.mock('@/lib/api-errors', () => ({ apiHandler: (fn: unknown) => fn, ApiError: class extends Error {
  constructor(code: string, details?: { message?: string }) { super(details?.message || code) }
} }))
vi.mock('@/lib/prisma', () => ({ prisma: { novelPromotionEpisode: { findFirst: async () => ({
  clips: [{ id: 'clip' }], storyboards: [{ id: 'storyboard', clipId: 'clip', panels: [
    { panelIndex: 0, description: 'A', videoUrl: 'one.mp4', lipSyncVideoUrl: null },
    { panelIndex: 1, description: 'B', videoUrl: 'missing.mp4', lipSyncVideoUrl: null },
  ] }],
}) } } }))
vi.mock('@/lib/media/service', () => ({ resolveStorageKeyFromMediaValue: async (value: string) => value }))
vi.mock('@/lib/storage', () => ({
  toFetchableUrl: (value: string) => value,
  getObjectBuffer: async (key: string) => { if (key === 'missing.mp4') throw new Error('not found'); return Buffer.from('video') },
}))
describe('server video archive completeness', () => {
  it('does not return a successful ZIP when a required shot cannot be read', async () => {
    const { POST } = await import('@/app/api/novel-promotion/[projectId]/download-videos/route')
    await expect(POST(buildMockRequest({ path: '/api/novel-promotion/project/download-videos', method: 'POST', body: { episodeId: 'ep' } }),
      { params: Promise.resolve({ projectId: 'project' }) })).rejects.toThrow('视频下载不完整：1/2')
  })
})
