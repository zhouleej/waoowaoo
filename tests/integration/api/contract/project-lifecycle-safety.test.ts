import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

const mocks = vi.hoisted(() => ({
  remove: vi.fn(), deleteObjects: vi.fn(), retain: vi.fn().mockResolvedValue('manifest'),
  cleanupVoice: vi.fn().mockResolvedValue({ deletedVoiceIds: [], skippedReferencedVoiceIds: [] }),
  findProject: vi.fn(async (args: { include?: { user?: unknown } }) => ({
    id: 'project', userId: 'owner', name: 'Project',
    user: args.include?.user === true
      ? { id: 'owner', name: 'Owner', password: 'sensitive-hash', email: 'private@example.com' }
      : { id: 'owner', name: 'Owner', image: null },
  })),
}))
vi.mock('@/lib/api-auth', () => ({
  requireProjectAuthLight: async () => ({ session: { user: { id: 'owner' } } }), isErrorResponse: () => false,
}))
vi.mock('@/lib/api-errors', () => ({ apiHandler: (fn: unknown) => fn, ApiError: class extends Error {} }))
vi.mock('@/lib/logging/semantic', () => ({ logProjectAction: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: {
  project: { findUnique: mocks.findProject, update: vi.fn().mockResolvedValue({}), delete: mocks.remove },
  novelPromotionProject: { findUnique: vi.fn().mockResolvedValue({
    characters: [{ appearances: [{ imageUrl: 'shared.png' }] }], locations: [], episodes: [],
  }) },
} }))
vi.mock('@/lib/storage', () => ({ addSignedUrlsToProject: (value: unknown) => value, deleteObjects: mocks.deleteObjects }))
vi.mock('@/lib/media/service', () => ({ resolveStorageKeyFromMediaValue: async (value: string) => value }))
vi.mock('@/lib/media/attach', () => ({ attachMediaFieldsToProject: async (value: unknown) => value }))
vi.mock('@/lib/media/retention', () => ({ retainProjectMedia: mocks.retain }))
vi.mock('@/lib/providers/bailian', () => ({
  collectProjectBailianManagedVoiceIds: async () => [], cleanupUnreferencedBailianVoices: mocks.cleanupVoice,
}))

describe('shared project lifecycle', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.remove.mockResolvedValue({}) })
  const context = { params: Promise.resolve({ projectId: 'project' }) }
  const request = buildMockRequest({ path: '/api/projects/project', method: 'GET' })

  it.each(['detail', 'data'])('excludes owner credentials from %s response', async (kind) => {
    const route = kind === 'detail'
      ? await import('@/app/api/projects/[projectId]/route')
      : await import('@/app/api/projects/[projectId]/data/route')
    const response = await route.GET(request, context)
    const body = await response.json()
    expect(body.project.user).toEqual({ id: 'owner', name: 'Owner', image: null })
    expect(JSON.stringify(body)).not.toContain('sensitive-hash')
  })

  it('retains the shared object after deleting its source project', async () => {
    const { DELETE } = await import('@/app/api/projects/[projectId]/route')
    await DELETE(request, context)
    expect(mocks.retain).toHaveBeenCalledWith('project', ['shared.png'])
    expect(mocks.remove).toHaveBeenCalledWith({ where: { id: 'project' } })
    expect(mocks.deleteObjects).not.toHaveBeenCalled()
  })

  it('does not remove files or remote voices when database deletion fails', async () => {
    mocks.remove.mockRejectedValueOnce(new Error('database failure'))
    const { DELETE } = await import('@/app/api/projects/[projectId]/route')
    await expect(DELETE(request, context)).rejects.toThrow('database failure')
    expect(mocks.deleteObjects).not.toHaveBeenCalled()
    expect(mocks.cleanupVoice).not.toHaveBeenCalled()
  })
})
