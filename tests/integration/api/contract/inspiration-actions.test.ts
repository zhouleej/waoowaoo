import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'
const state = vi.hoisted(() => ({ owned: true, status: 'failed', submit: vi.fn().mockResolvedValue({ taskId: 'retry-task' }), cancel: vi.fn(), remove: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: {
  inspirationVideoCreation: { findFirst: async () => state.owned ? { id: 'creation', modelKey: 'maas-seedance::doubao-seedance-2.0', prompt: 'rain', duration: 5, aspectRatio: '16:9', resolution: '720p', generateAudio: true } : null,
    update: async () => ({}), delete: state.remove },
  task: { findFirst: async () => ({ id: 'task', status: state.status }) },
} }))
vi.mock('@/lib/task/submitter', () => ({ submitTask: state.submit }))
vi.mock('@/lib/task/service', () => ({ cancelTask: state.cancel }))
vi.mock('@/lib/task/queues', () => ({ removeTaskJob: async () => true }))
import { actOnCreation } from '@/lib/inspiration-video/actions'
describe('inspiration history actions', () => {
  beforeEach(() => { vi.clearAllMocks(); state.owned = true; state.status = 'failed' })
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
})
