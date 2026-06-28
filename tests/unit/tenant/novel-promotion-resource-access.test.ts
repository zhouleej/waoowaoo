import { beforeEach, describe, expect, it, vi } from 'vitest'

const prismaMock = vi.hoisted(() => ({
  novelPromotionClip: { findFirst: vi.fn() },
  novelPromotionPanel: { findFirst: vi.fn() },
  characterAppearance: { findFirst: vi.fn() },
  locationImage: { findFirst: vi.fn() },
  novelPromotionShot: { findFirst: vi.fn() },
}))

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))

describe('novel promotion resource access guards', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('scopes clip lookup through episode project ownership', async () => {
    const { requireNovelPromotionClipInProject } = await import('@/lib/saas/novel-promotion-resource-access')
    prismaMock.novelPromotionClip.findFirst.mockResolvedValueOnce({ id: 'clip-1', episodeId: 'episode-1' })

    await expect(requireNovelPromotionClipInProject('project-1', 'clip-1')).resolves.toEqual({
      id: 'clip-1',
      episodeId: 'episode-1',
    })
    expect(prismaMock.novelPromotionClip.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: 'clip-1',
        episode: {
          novelPromotionProject: { projectId: 'project-1' },
        },
      },
    }))
  })

  it('scopes panel lookup through storyboard episode project ownership', async () => {
    const { requireNovelPromotionPanelByStoryboardIndexInProject } = await import('@/lib/saas/novel-promotion-resource-access')
    prismaMock.novelPromotionPanel.findFirst.mockResolvedValueOnce({
      id: 'panel-1',
      storyboardId: 'storyboard-1',
      panelIndex: 0,
    })

    await expect(
      requireNovelPromotionPanelByStoryboardIndexInProject('project-1', 'storyboard-1', 0),
    ).resolves.toMatchObject({ id: 'panel-1' })
    expect(prismaMock.novelPromotionPanel.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        storyboardId: 'storyboard-1',
        panelIndex: 0,
        storyboard: {
          episode: {
            novelPromotionProject: { projectId: 'project-1' },
          },
        },
      },
    }))
  })

  it('scopes appearance and location image lookups to the route project', async () => {
    const {
      requireNovelPromotionCharacterAppearanceInProject,
      requireNovelPromotionLocationImageInProject,
    } = await import('@/lib/saas/novel-promotion-resource-access')
    prismaMock.characterAppearance.findFirst.mockResolvedValueOnce({ id: 'appearance-1', characterId: 'character-1' })
    prismaMock.locationImage.findFirst.mockResolvedValueOnce({ id: 'location-image-1' })

    await expect(
      requireNovelPromotionCharacterAppearanceInProject('project-1', 'appearance-1'),
    ).resolves.toMatchObject({ characterId: 'character-1' })
    await expect(
      requireNovelPromotionLocationImageInProject('project-1', 'location-1', 0),
    ).resolves.toEqual({ id: 'location-image-1' })

    expect(prismaMock.characterAppearance.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: 'appearance-1',
        character: {
          novelPromotionProject: { projectId: 'project-1' },
        },
      },
    }))
    expect(prismaMock.locationImage.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        locationId: 'location-1',
        imageIndex: 0,
        location: {
          novelPromotionProject: { projectId: 'project-1' },
        },
      },
    }))
  })

  it('returns NOT_FOUND when a child resource is outside the project scope', async () => {
    const { requireNovelPromotionShotInProject } = await import('@/lib/saas/novel-promotion-resource-access')
    prismaMock.novelPromotionShot.findFirst.mockResolvedValueOnce(null)

    await expect(requireNovelPromotionShotInProject('project-1', 'foreign-shot')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    expect(prismaMock.novelPromotionShot.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: 'foreign-shot',
        episode: {
          novelPromotionProject: { projectId: 'project-1' },
        },
      },
    }))
  })
})
