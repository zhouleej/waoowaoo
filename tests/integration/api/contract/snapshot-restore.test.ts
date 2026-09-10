import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Prisma } from '@prisma/client'

const state = vi.hoisted(() => ({ files: new Map<string, string>(), activeTasks: 0, fail: false, title: 'old' }))
const episode = vi.hoisted(() => ({ id: 'ep', novelPromotionProjectId: 'np', name: 'Original', clips: [{ id: 'clip', episodeId: 'ep' }], shots: [], storyboards: [], voiceLines: [], editorProject: null }))
const tx = vi.hoisted(() => ({
  novelPromotionEpisode: {
    findUnique: vi.fn(async () => episode), findFirst: vi.fn(async () => episode),
    delete: vi.fn(async () => { state.title = 'deleted' }), create: vi.fn(async () => { state.title = 'restored' }),
  },
  novelPromotionProject: { findUnique: vi.fn(async () => ({ projectId: 'project' })) },
  task: { count: vi.fn(async () => state.activeTasks) },
  novelPromotionClip: { create: vi.fn(async () => { if (state.fail) throw new Error('failed') }) },
}))
vi.mock('node:fs/promises', () => ({
  mkdir: async () => {},
  writeFile: async (file: string, content: string) => { state.files.set(file, content) },
  readFile: async (file: string) => { const content = state.files.get(file); if (!content) throw new Error('missing'); return content },
  readdir: async () => [...state.files.keys()].map((file) => file.split(/[\\/]/).pop()),
}))
vi.mock('@/lib/prisma', () => ({ prisma: { $transaction: async (fn: (client: typeof tx) => Promise<unknown>) => {
  const title = state.title
  try { return await fn(tx) } catch (error) { state.title = title; throw error }
} } }))
import { saveEpisodeSnapshot, restoreEpisodeSnapshot, listEpisodeSnapshots } from '@/lib/novel-promotion/episode-snapshots'

describe('episode snapshot lifecycle', () => {
  beforeEach(() => { state.files.clear(); state.activeTasks = 0; state.fail = false; state.title = 'old'; vi.clearAllMocks() })
  it('saves and restores the original clip identity', async () => {
    const id = await saveEpisodeSnapshot(tx as unknown as Prisma.TransactionClient, 'ep')
    expect((await listEpisodeSnapshots('project', 'ep'))[0].clips).toBe(1)
    expect(await restoreEpisodeSnapshot('project', 'ep', id!)).toEqual({ restored: id })
    expect(tx.novelPromotionClip.create).toHaveBeenCalledWith({ data: { id: 'clip', episodeId: 'ep' } })
  })
  it('rejects cross-project restore and active generation', async () => {
    const id = await saveEpisodeSnapshot(tx as unknown as Prisma.TransactionClient, 'ep')
    await expect(restoreEpisodeSnapshot('other-project', 'ep', id!)).rejects.toThrow('SNAPSHOT_SCOPE_MISMATCH')
    state.activeTasks = 1
    await expect(restoreEpisodeSnapshot('project', 'ep', id!)).rejects.toThrow('生成任务')
    expect(state.title).toBe('old')
  })
  it('rolls back all replacement writes if restoration fails', async () => {
    const id = await saveEpisodeSnapshot(tx as unknown as Prisma.TransactionClient, 'ep')
    state.fail = true
    await expect(restoreEpisodeSnapshot('project', 'ep', id!)).rejects.toThrow('failed')
    expect(state.title).toBe('old')
  })
})
