import { describe, expect, it, vi } from 'vitest'
import { assembleEditorProject } from '@/features/video-editor/utils/assemble-project'
vi.mock('@/lib/prisma', () => ({ prisma: { novelPromotionEpisode: { findFirst: async () => ({
  storyboards: [{ panels: [{ id: 'p', storyboardId: 's', videoUrl: 'allowed.mp4', lipSyncVideoUrl: null }] }], voiceLines: [],
}) } } }))
vi.mock('@/lib/media/service', () => ({ resolveStorageKeyFromMediaValue: async (value: string) => value }))
import { authorizeEditorMedia } from '@/lib/video-editor/media-access'

describe('editor media boundary', () => {
  it('accepts current episode video and rejects a substituted source URL', async () => {
    const project = assembleEditorProject('ep', [{ id: 'p', storyboardId: 's', videoUrl: 'allowed.mp4' }], [])
    expect((await authorizeEditorMedia('project', project)).keys).toEqual(['allowed.mp4'])
    project.timeline[0].src = 'http://127.0.0.1/private'
    await expect(authorizeEditorMedia('project', project)).rejects.toThrow('EDITOR_MEDIA_CHANGED_OR_FORBIDDEN')
  })
})
