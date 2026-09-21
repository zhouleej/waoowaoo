import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'
const state = vi.hoisted(() => ({ owned: true, status: 'failed', payload: null as Record<string, unknown> | null, submit: vi.fn().mockResolvedValue({ taskId: 'retry-task' }), cancel: vi.fn(), remove: vi.fn(), removeJob: vi.fn(async () => true) }))
vi.mock('@/lib/prisma', () => ({ prisma: {
  inspirationVideoCreation: { findFirst: async () => state.owned ? { id: 'creation', modelKey: 'maas-seedance::doubao-seedance-2.0', prompt: 'rain', duration: 5, aspectRatio: '16:9', resolution: '720p', generateAudio: true } : null,
    update: async () => ({}), delete: state.remove },
  task: { findFirst: async () => ({ id: 'task', status: state.status, payload: state.payload }) },
} }))
vi.mock('@/lib/task/submitter', () => ({ submitTask: state.submit }))
vi.mock('@/lib/task/service', () => ({ cancelTask: state.cancel }))
vi.mock('@/lib/task/queues', () => ({ removeTaskJob: state.removeJob }))
import { actOnCreation } from '@/lib/inspiration-video/actions'
describe('inspiration history actions', () => {
  beforeEach(() => { vi.clearAllMocks(); state.owned = true; state.status = 'failed'; state.payload = null; state.cancel.mockResolvedValue({ cancelled: true, task: { status: 'canceled' } }) })
  const run = (action: string) => actOnCreation(buildMockRequest({ path: '/api/inspiration-video', method: 'POST', body: { id: 'creation', action, locale: 'zh' } }), 'user', { id: 'workspace', projectId: 'project' })
  it('retries with saved settings and the same material identity', async () => {
    expect((await (await run('retry')).json()).taskId).toBe('retry-task')
    expect(state.submit).toHaveBeenCalledWith(expect.objectContaining({ targetId: 'creation', dedupeKey: 'inspiration_video:creation' }))
    expect(state.submit).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.not.objectContaining({ generateThumbnailFromVideo: true }),
    }))
  })
  it('rejects another workspace and active task deletion', async () => {
    state.owned = false
    await expect(run('delete')).rejects.toThrow()
    state.owned = true; state.status = 'processing'
    await expect(run('delete')).rejects.toThrow()
    expect(state.remove).not.toHaveBeenCalledWith({ where: { id: 'creation' } })
  })
  it('cancels the active task', async () => {
    state.status = 'processing'
    await run('cancel')
    expect(state.cancel).toHaveBeenCalledWith('task')
  })

  it('preserves original input metadata but not the previous run identity when retrying', async () => {
    state.payload = {
      mobileCloudAssets: { primaryImageAssetId: 'asset-person', referenceImages: [{ assetId: 'asset-room', sortOrder: 1 }] },
      generateThumbnailFromVideo: true,
      generationOptions: { duration: 5, generateAudio: true },
      runId: 'old-run', meta: { runId: 'old-run' },
    }
    await run('retry')
    expect(state.submit).toHaveBeenCalledWith(expect.objectContaining({ payload: expect.objectContaining({
      mobileCloudAssets: state.payload.mobileCloudAssets, generateThumbnailFromVideo: true,
    }) }))
    expect(state.submit.mock.calls[0][0].payload).not.toHaveProperty('runId')
    expect(state.submit.mock.calls[0][0].payload).not.toHaveProperty('meta')
  })

  it('does not report cancellation success or remove a settling job', async () => {
    state.status = 'processing'
    state.cancel.mockResolvedValueOnce({ cancelled: false, task: { status: 'settling' } })
    await expect(run('cancel')).rejects.toThrow()
    expect(state.removeJob).not.toHaveBeenCalledWith('task')
  })

  it('keeps unsupported audio controls absent when retrying', async () => {
    state.payload = { generationOptions: { duration: 5, resolution: '720p' } }
    await run('retry')
    expect(state.submit.mock.calls[0][0].payload.generationOptions).not.toHaveProperty('generateAudio')
  })
})
