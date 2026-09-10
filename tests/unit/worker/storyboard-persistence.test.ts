import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  novelPromotionVoiceLine: { deleteMany: vi.fn().mockResolvedValue({ count: 2 }) },
}))
vi.mock('@/lib/prisma', () => ({ prisma: {
  $transaction: async (run: (tx: typeof db) => Promise<unknown>) => run(db),
} }))

describe('storyboard persistence voice replacement', () => {
  beforeEach(() => vi.clearAllMocks())

  it('preserves existing voice lines when a step retry skips voice analysis', async () => {
    const { persistStoryboardOutputs } = await import('@/lib/workers/handlers/script-to-storyboard-helpers')
    await persistStoryboardOutputs({ episodeId: 'episode', clipPanels: [], voiceLineRows: null })
    expect(db.novelPromotionVoiceLine.deleteMany).not.toHaveBeenCalled()
  })

  it('clears voice lines only when analysis explicitly returns an empty list', async () => {
    const { persistStoryboardOutputs } = await import('@/lib/workers/handlers/script-to-storyboard-helpers')
    await persistStoryboardOutputs({ episodeId: 'episode', clipPanels: [], voiceLineRows: [] })
    expect(db.novelPromotionVoiceLine.deleteMany).toHaveBeenCalledWith({ where: { episodeId: 'episode' } })
  })
})
