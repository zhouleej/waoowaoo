import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

const state = vi.hoisted(() => ({ line: {
  id: 'line', episodeId: 'episode', content: 'Old', speaker: 'Alice', emotionStrength: 0.4,
  audioUrl: 'old.wav', audioMediaId: 'old-media', audioDuration: 5000, matchedPanelId: 'panel',
} }))
const db = vi.hoisted(() => ({
  novelPromotionVoiceLine: {
    findUnique: vi.fn(async () => state.line),
    update: vi.fn(async ({ data }: { data: object }) => ({ ...state.line, ...data })),
  },
  novelPromotionPanel: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
}))
vi.mock('@/lib/prisma', () => ({ prisma: { ...db, $transaction: async (fn: (tx: typeof db) => Promise<unknown>) => fn(db) } }))
vi.mock('@/lib/api-auth', () => ({ requireProjectAuthLight: async () => ({}), isErrorResponse: () => false }))
vi.mock('@/lib/api-errors', () => ({ apiHandler: (fn: unknown) => fn, ApiError: class extends Error {} }))
vi.mock('@/lib/saas/novel-promotion-resource-access', () => ({ requireNovelPromotionVoiceLineInProject: async () => state.line }))
vi.mock('@/lib/media/service', () => ({
  resolveMediaRef: async (_id: unknown, url: string | null) => url ? { url } : null,
  resolveMediaRefFromLegacyValue: async () => null,
}))

describe('voice edits invalidate generated output', () => {
  beforeEach(() => vi.clearAllMocks())
  it('removes stale audio references and lip sync when dialogue changes', async () => {
    const { PATCH } = await import('@/app/api/novel-promotion/[projectId]/voice-lines/route')
    const response = await PATCH(buildMockRequest({ path: '/api/novel-promotion/project/voice-lines', method: 'PATCH',
      body: { lineId: 'line', content: 'New' },
    }), { params: Promise.resolve({ projectId: 'project' }) })
    const body = await response.json()
    expect(body.voiceLine.content).toBe('New')
    expect(body.voiceLine.audioUrl).toBeNull()
    expect(body.voiceLine.audioMediaId).toBeNull()
    expect(db.novelPromotionPanel.updateMany).toHaveBeenCalledWith({
      where: { matchedVoiceLines: { some: { id: 'line' } } },
      data: { lipSyncVideoUrl: null, lipSyncVideoMediaId: null, lipSyncTaskId: null },
    })
  })
  it('preserves audio for a no-op content save', async () => {
    const { PATCH } = await import('@/app/api/novel-promotion/[projectId]/voice-lines/route')
    const response = await PATCH(buildMockRequest({ path: '/api/novel-promotion/project/voice-lines', method: 'PATCH',
      body: { lineId: 'line', content: 'Old' },
    }), { params: Promise.resolve({ projectId: 'project' }) })
    expect((await response.json()).voiceLine.audioUrl).toBe('old.wav')
  })
})
