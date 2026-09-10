import { beforeEach, describe, expect, it, vi } from 'vitest'
import { writeFile } from 'node:fs/promises'
import type { Job } from 'bullmq'
import type { TaskJobData } from '@/lib/task/types'
import { assembleEditorProject } from '@/features/video-editor/utils/assemble-project'

const mocks = vi.hoisted(() => ({ update: vi.fn().mockResolvedValue({}), upload: vi.fn().mockResolvedValue('editor/result.mp4'), check: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: { videoEditorProject: { update: mocks.update } } }))
vi.mock('@/lib/storage', () => ({ getObjectBuffer: async () => Buffer.from('media'), uploadObject: mocks.upload }))
vi.mock('@/lib/workers/utils', () => ({ assertTaskActive: mocks.check }))
vi.mock('@/lib/workers/shared', () => ({ reportTaskProgress: async () => {} }))
vi.mock('@/lib/video-editor/media-access', () => ({ authorizeEditorMedia: async (_id: string, project: unknown) => ({ project, keys: ['clip.mp4'] }) }))
vi.mock('@/lib/video-editor/render', () => ({ renderEditorVideo: async (_project: unknown, output: string) => writeFile(output, 'rendered') }))

describe('EDITOR_RENDER worker', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.check.mockResolvedValue(undefined) })
  it('renders the authorized snapshot and persists its output', async () => {
    const { handleEditorRenderTask } = await import('@/lib/workers/handlers/editor-render')
    const project = assembleEditorProject('episode', [{ id: 'panel', storyboardId: 'storyboard', videoUrl: 'clip.mp4' }], [])
    const result = await handleEditorRenderTask({ data: {
      taskId: 'task', targetId: 'editor-id', projectId: 'project', payload: { projectData: project },
    } } as unknown as Job<TaskJobData>)
    expect(result).toEqual({ outputUrl: 'editor/result.mp4' })
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: 'editor-id' }, data: { outputUrl: 'editor/result.mp4', renderStatus: 'completed' } })
  })
  it('does not publish a completed output if canceled during upload', async () => {
    mocks.check.mockImplementation(async (_job, stage) => { if (stage === 'editor_persist') throw new Error('cancelled') })
    const { handleEditorRenderTask } = await import('@/lib/workers/handlers/editor-render')
    const project = assembleEditorProject('episode', [{ id: 'panel', storyboardId: 'storyboard', videoUrl: 'clip.mp4' }], [])
    await expect(handleEditorRenderTask({ data: {
      taskId: 'task', targetId: 'editor-id', projectId: 'project', payload: { projectData: project },
    } } as unknown as Job<TaskJobData>)).rejects.toThrow('cancelled')
    expect(mocks.update).not.toHaveBeenCalled()
  })
})
