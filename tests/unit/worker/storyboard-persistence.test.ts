import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  novelPromotionStoryboard: { upsert: vi.fn().mockResolvedValue({ id: 'storyboard', clipId: 'clip' }) },
  novelPromotionPanel: {
    deleteMany: vi.fn(),
    upsert: vi.fn(async ({ update }: { update: object }) => ({ id: 'existing-panel', ...update })),
  },
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

  it('updates the retried panel without deleting its media or voice bindings', async () => {
    const { persistStoryboardOutputs } = await import('@/lib/workers/handlers/script-to-storyboard-helpers')
    await persistStoryboardOutputs({ episodeId: 'episode', voiceLineRows: null, clipPanels: [{
      clipId: 'clip', clipIndex: 0, finalPanels: [{ panel_number: 1, description: 'Updated' }],
    }] })
    expect(db.novelPromotionPanel.deleteMany).not.toHaveBeenCalled()
    expect(db.novelPromotionPanel.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { storyboardId_panelIndex: { storyboardId: 'storyboard', panelIndex: 0 } },
      update: expect.objectContaining({ description: 'Updated' }),
    }))
    expect(db.novelPromotionPanel.upsert.mock.calls[0][0].update).not.toHaveProperty('videoUrl')
  })
})
