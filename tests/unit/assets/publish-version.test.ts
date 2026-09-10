import { beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ image: 'old.png' }))
const mocks = vi.hoisted(() => ({ create: vi.fn(async () => ({ id: 'new-version' })), update: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: {
  novelPromotionLocation: {
    findFirst: async () => ({ id: 'location', name: 'Room', summary: null, assetKind: 'location', sourceGlobalLocationId: 'old-version', images: [{ imageUrl: state.image, isSelected: true, description: 'Room', availableSlots: null }] }),
    update: mocks.update,
  },
  globalLocation: { findFirst: async () => ({ id: 'old-version', name: 'Room', summary: null, images: [{ imageUrl: 'old.png', isSelected: true, description: 'Room', availableSlots: null }] }), create: mocks.create },
} }))
import { publishProjectAsset } from '@/lib/assets/services/publish-project-assets'
describe('asset publication revisions', () => {
  beforeEach(() => { state.image = 'old.png'; vi.clearAllMocks() })
  it('reuses unchanged publication and publishes changed output as a separate version', async () => {
    const input = { projectId: 'project', userId: 'user', assetId: 'location', kind: 'location' as const }
    expect(await publishProjectAsset(input)).toEqual({ kind: 'location', status: 'already-published', globalAssetId: 'old-version' })
    state.image = 'new.png'
    expect(await publishProjectAsset(input)).toEqual({ kind: 'location', status: 'published', globalAssetId: 'new-version' })
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: 'location' }, data: { sourceGlobalLocationId: 'new-version' } })
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ images: { create: [expect.objectContaining({ imageUrl: 'new.png' })] } }) }))
  })
})
