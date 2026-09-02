import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

const authState = vi.hoisted(() => ({ authenticated: false }))
const publishProjectAssetMock = vi.hoisted(() => vi.fn())
const publishProjectAssetsMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/api-errors', () => ({
  apiHandler: <T extends (...args: never[]) => unknown>(handler: T) => handler,
  ApiError: class ApiError extends Error {},
}))

vi.mock('@/lib/api-auth', () => ({
  isErrorResponse: (value: unknown) => value instanceof Response,
  requireProjectAuthLight: async (projectId: string) => {
    if (!authState.authenticated) {
      return new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED' } }), { status: 401 })
    }
    return {
      session: { user: { id: 'user-1' } },
      project: { id: projectId, userId: 'user-1' },
    }
  },
}))

vi.mock('@/lib/assets/services/publish-project-assets', () => ({
  publishProjectAsset: publishProjectAssetMock,
  publishProjectAssets: publishProjectAssetsMock,
}))

describe('project asset publish route contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState.authenticated = false
  })

  it('requires project authentication before publishing assets', async () => {
    const { POST } = await import('@/app/api/projects/[projectId]/assets/publish/route')
    const response = await POST(
      buildMockRequest({ path: '/api/projects/project-1/assets/publish', method: 'POST', body: {} }),
      { params: Promise.resolve({ projectId: 'project-1' }) },
    )

    expect(response.status).toBe(401)
    expect(publishProjectAssetsMock).not.toHaveBeenCalled()
  })

  it('publishes the requested asset with the authenticated project scope', async () => {
    authState.authenticated = true
    publishProjectAssetMock.mockResolvedValue({
      kind: 'character',
      status: 'published',
      globalAssetId: 'global-character-1',
    })
    const { POST } = await import('@/app/api/projects/[projectId]/assets/publish/route')
    const response = await POST(
      buildMockRequest({
        path: '/api/projects/project-1/assets/publish',
        method: 'POST',
        body: { assetId: 'character-1', kind: 'character' },
      }),
      { params: Promise.resolve({ projectId: 'project-1' }) },
    )

    expect(response.status).toBe(200)
    expect(publishProjectAssetMock).toHaveBeenCalledWith({
      projectId: 'project-1',
      userId: 'user-1',
      assetId: 'character-1',
      kind: 'character',
    })
    await expect(response.json()).resolves.toEqual({
      kind: 'character',
      status: 'published',
      globalAssetId: 'global-character-1',
    })
  })
})
