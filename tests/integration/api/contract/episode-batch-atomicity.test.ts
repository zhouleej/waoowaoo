import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

const state = vi.hoisted(() => ({ rows: ['old-episode'], failCreate: false }))
const db = vi.hoisted(() => ({
  novelPromotionProject: {
    findFirst: vi.fn().mockResolvedValue({ id: 'np' }),
    update: vi.fn().mockResolvedValue({}),
  },
  novelPromotionEpisode: {
    deleteMany: vi.fn(async () => { state.rows = []; return { count: 1 } }),
    findFirst: vi.fn().mockResolvedValue(null),
    create: vi.fn(async () => {
      if (state.failCreate) throw new Error('write failed')
      state.rows.push('new-episode')
      return { id: 'new-episode', episodeNumber: 1, name: 'New' }
    }),
  },
  $queryRaw: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/lib/prisma', () => ({ prisma: { ...db,
  $transaction: async (run: unknown) => {
    const before = [...state.rows]
    try {
      return typeof run === 'function' ? await run(db) : await Promise.all(run as Promise<unknown>[])
    } catch (error) { state.rows = before; throw error }
  },
} }))
vi.mock('@/lib/api-auth', () => ({
  requireProjectAuthLight: async () => ({ session: { user: { id: 'user' } } }),
  isErrorResponse: () => false,
}))
vi.mock('@/lib/api-errors', () => ({
  apiHandler: (handler: unknown) => handler,
  ApiError: class extends Error {},
}))

describe('episode import replacement', () => {
  beforeEach(() => { state.rows = ['old-episode']; state.failCreate = false; vi.clearAllMocks() })
  const request = (episodes: unknown[]) => buildMockRequest({
    path: '/api/novel-promotion/project/episodes/batch', method: 'POST',
    body: { episodes, clearExisting: true, importStatus: 'completed' },
  })
  it('keeps old episodes when replacement creation fails', async () => {
    state.failCreate = true
    const { POST } = await import('@/app/api/novel-promotion/[projectId]/episodes/batch/route')
    await expect(POST(request([{ name: 'New', novelText: 'story' }]), { params: Promise.resolve({ projectId: 'project' }) })).rejects.toThrow()
    expect(state.rows).toEqual(['old-episode'])
  })
  it('rejects invalid input before deleting anything', async () => {
    const { POST } = await import('@/app/api/novel-promotion/[projectId]/episodes/batch/route')
    await expect(POST(request([{ novelText: 'story' }]), { params: Promise.resolve({ projectId: 'project' }) })).rejects.toThrow()
    expect(db.novelPromotionEpisode.deleteMany).not.toHaveBeenCalledWith({ where: { novelPromotionProjectId: 'np' } })
  })
})
