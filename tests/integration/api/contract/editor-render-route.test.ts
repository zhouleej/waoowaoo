import { describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'
import { assembleEditorProject } from '@/features/video-editor/utils/assemble-project'
const state = vi.hoisted(() => ({ authenticated: true, editor: null as unknown, submit: vi.fn().mockResolvedValue({ taskId: 'render-task', status: 'queued' }), update: vi.fn() }))
vi.mock('@/lib/api-auth', () => ({ requireProjectAuthLight: async () => state.authenticated ? { session: { user: { id: 'user' } } } : new Response('', { status: 401 }), isErrorResponse: (value: unknown) => value instanceof Response }))
vi.mock('@/lib/api-errors', () => ({ apiHandler: (fn: unknown) => fn, ApiError: class extends Error {}, getRequestId: () => 'request' }))
vi.mock('@/lib/prisma', () => ({ prisma: { videoEditorProject: { findFirst: async () => state.editor, update: state.update } } }))
vi.mock('@/lib/task/submitter', () => ({ submitTask: state.submit }))
vi.mock('@/lib/video-editor/media-access', () => ({ authorizeEditorMedia: async (_id: string, project: unknown) => ({ project }) }))
vi.mock('@/lib/storage', () => ({ getSignedUrl: (value: string) => value }))

describe('editor render route', () => {
  it('submits a saved episode snapshot to the render task', async () => {
    state.authenticated = true
    const project = assembleEditorProject('ep', [{ id: 'p', storyboardId: 's', videoUrl: 'video.mp4' }], [])
    state.editor = { id: 'editor', episodeId: 'ep', projectData: JSON.stringify(project) }
    const { POST } = await import('@/app/api/novel-promotion/[projectId]/editor/render/route')
    const response = await POST(buildMockRequest({ path: '/api/novel-promotion/project/editor/render', method: 'POST', body: { editorProjectId: 'editor', locale: 'zh' } }), { params: Promise.resolve({ projectId: 'project' }) })
    expect((await response.json()).taskId).toBe('render-task')
    expect(state.submit).toHaveBeenCalledWith(expect.objectContaining({ type: 'editor_render', targetId: 'editor', payload: { projectData: project } }))
  })
  it('requires project authentication', async () => {
    state.authenticated = false
    const { POST } = await import('@/app/api/novel-promotion/[projectId]/editor/render/route')
    const response = await POST(buildMockRequest({ path: '/api/novel-promotion/project/editor/render', method: 'POST', body: {} }), { params: Promise.resolve({ projectId: 'project' }) })
    expect(response.status).toBe(401)
  })
})
