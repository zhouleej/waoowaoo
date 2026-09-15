import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

const mocks = vi.hoisted(() => ({
  panel: vi.fn(), voice: vi.fn(), submit: vi.fn().mockResolvedValue({ taskId: 'task' }),
}))
vi.mock('@/lib/prisma', () => ({ prisma: {
  userPreference: { findUnique: async () => ({ lipSyncModel: 'fal::lipsync' }) },
  novelPromotionPanel: { findFirst: mocks.panel },
  novelPromotionVoiceLine: { findFirst: mocks.voice },
} }))
vi.mock('@/lib/api-auth', () => ({ requireProjectAuthLight: async () => ({ session: { user: { id: 'user' } } }), isErrorResponse: () => false }))
vi.mock('@/lib/api-errors', () => ({ apiHandler: (fn: unknown) => fn, ApiError: class extends Error {}, getRequestId: () => 'request' }))
vi.mock('@/lib/task/submitter', () => ({ submitTask: mocks.submit }))
vi.mock('@/lib/task/has-output', () => ({ hasPanelLipSyncOutput: async () => false }))
vi.mock('@/lib/billing', () => ({ buildDefaultTaskBillingInfo: () => ({ billable: false }) }))

describe('lip-sync resource scope', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.panel.mockResolvedValue({ id: 'panel', videoUrl: 'video.mp4', storyboard: { episodeId: 'episode' } })
    mocks.voice.mockResolvedValue({ id: 'line', audioUrl: 'voice.wav' })
  })
  const request = () => buildMockRequest({ path: '/api/novel-promotion/project/lip-sync', method: 'POST',
    body: { storyboardId: 'storyboard', panelIndex: 0, voiceLineId: 'line', locale: 'zh' },
  })
  it('requires the target panel to belong to the authorized project', async () => {
    mocks.panel.mockImplementation(async ({ where }) => where.storyboard?.episode?.novelPromotionProject?.projectId === 'project' ? null : { id: 'foreign-panel' })
    const { POST } = await import('@/app/api/novel-promotion/[projectId]/lip-sync/route')
    await expect(POST(request(), { params: Promise.resolve({ projectId: 'project' }) })).rejects.toThrow()
    expect(mocks.submit).not.toHaveBeenCalled()
  })
  it('rejects a voice line outside the selected panel episode before billing', async () => {
    mocks.voice.mockResolvedValue(null)
    const { POST } = await import('@/app/api/novel-promotion/[projectId]/lip-sync/route')
    await expect(POST(request(), { params: Promise.resolve({ projectId: 'project' }) })).rejects.toThrow()
    expect(mocks.voice).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'line', episodeId: 'episode' } }))
    expect(mocks.submit).not.toHaveBeenCalled()
  })
  it('submits valid video and audio from the same episode', async () => {
    const { POST } = await import('@/app/api/novel-promotion/[projectId]/lip-sync/route')
    const response = await POST(request(), { params: Promise.resolve({ projectId: 'project' }) })
    expect(response.status).toBe(200)
    expect(mocks.submit).toHaveBeenCalledWith(expect.objectContaining({ targetId: 'panel', projectId: 'project', episodeId: 'episode' }))
  })
})
