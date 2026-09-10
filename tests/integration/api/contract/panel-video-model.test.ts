import { describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'
const update = vi.hoisted(() => vi.fn().mockResolvedValue({}))
vi.mock('@/lib/prisma', () => ({ prisma: { novelPromotionPanel: { update } } }))
vi.mock('@/lib/api-auth', () => ({ requireProjectAuthLight: async () => ({}), isErrorResponse: () => false }))
vi.mock('@/lib/api-errors', () => ({ apiHandler: (fn: unknown) => fn, ApiError: class extends Error {} }))
vi.mock('@/lib/saas/novel-promotion-resource-access', () => ({ requireNovelPromotionPanelInProject: async () => ({ id: 'panel' }) }))
describe('per-panel video model', () => {
  it('persists a model on the selected panel without updating project defaults', async () => {
    const { PATCH } = await import('@/app/api/novel-promotion/[projectId]/panel/route')
    const response = await PATCH(buildMockRequest({ path: '/api/novel-promotion/project/panel', method: 'PATCH', body: { panelId: 'panel', videoModel: 'google::veo-3.1-generate-preview' } }), { params: Promise.resolve({ projectId: 'project' }) })
    expect(response.status).toBe(200)
    expect(update).toHaveBeenCalledWith({ where: { id: 'panel' }, data: { videoModel: 'google::veo-3.1-generate-preview' } })
  })
})
