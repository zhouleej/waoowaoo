import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

function readProjectFile(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')
}

describe('tenant resource isolation source guards', () => {
  it('does not pass project PATCH request bodies directly into Prisma updates', () => {
    const source = readProjectFile('src/app/api/projects/[projectId]/route.ts')

    expect(source).toContain('PROJECT_PATCH_BLOCKED_FIELDS')
    expect(source).toContain('pickProjectPatchData')
    expect(source).not.toMatch(/data:\s*body\b/)
    expect(source).toContain('organizationId')
    expect(source).toContain('userId')
  })

  it('requires project-scoped access before novel promotion child resource mutations', () => {
    const helper = readProjectFile('src/lib/saas/novel-promotion-resource-access.ts')
    const routes = [
      'src/app/api/novel-promotion/[projectId]/episodes/[episodeId]/route.ts',
      'src/app/api/novel-promotion/[projectId]/storyboards/route.ts',
      'src/app/api/novel-promotion/[projectId]/clips/[clipId]/route.ts',
      'src/app/api/novel-promotion/[projectId]/panel/route.ts',
      'src/app/api/novel-promotion/[projectId]/panel-link/route.ts',
      'src/app/api/novel-promotion/[projectId]/panel/select-candidate/route.ts',
      'src/app/api/novel-promotion/[projectId]/storyboard-group/route.ts',
      'src/app/api/novel-promotion/[projectId]/character/route.ts',
      'src/app/api/novel-promotion/[projectId]/character-voice/route.ts',
      'src/app/api/novel-promotion/[projectId]/character/confirm-selection/route.ts',
      'src/app/api/novel-promotion/[projectId]/character/appearance/route.ts',
      'src/app/api/novel-promotion/[projectId]/location/route.ts',
      'src/app/api/novel-promotion/[projectId]/location/confirm-selection/route.ts',
      'src/app/api/novel-promotion/[projectId]/update-appearance/route.ts',
      'src/app/api/novel-promotion/[projectId]/update-location/route.ts',
      'src/app/api/novel-promotion/[projectId]/upload-asset-image/route.ts',
      'src/app/api/novel-promotion/[projectId]/voice-lines/route.ts',
      'src/app/api/novel-promotion/[projectId]/speaker-voice/route.ts',
      'src/app/api/novel-promotion/[projectId]/editor/route.ts',
      'src/app/api/novel-promotion/[projectId]/photography-plan/route.ts',
      'src/app/api/novel-promotion/[projectId]/generate-video/route.ts',
      'src/app/api/novel-promotion/[projectId]/modify-storyboard-image/route.ts',
      'src/app/api/novel-promotion/[projectId]/generate-character-image/route.ts',
      'src/app/api/novel-promotion/[projectId]/regenerate-group/route.ts',
      'src/app/api/novel-promotion/[projectId]/update-prompt/route.ts',
    ]

    expect(helper).toContain('requireNovelPromotionEpisodeInProject')
    expect(helper).toContain('requireNovelPromotionStoryboardInProject')
    expect(helper).toContain('requireNovelPromotionClipInProject')
    expect(helper).toContain('requireNovelPromotionPanelInProject')
    expect(helper).toContain('requireNovelPromotionPanelByStoryboardIndexInProject')
    expect(helper).toContain('requireNovelPromotionCharacterInProject')
    expect(helper).toContain('requireNovelPromotionCharacterAppearanceInProject')
    expect(helper).toContain('requireNovelPromotionLocationInProject')
    expect(helper).toContain('requireNovelPromotionLocationImageInProject')
    expect(helper).toContain('requireNovelPromotionVoiceLineInProject')
    expect(helper).toContain('requireNovelPromotionShotInProject')

    for (const route of routes) {
      const source = readProjectFile(route)
      expect(source, route).toMatch(
        /requireNovelPromotion|novelPromotionProject:\s*\{\s*projectId\s*\}|novelPromotionProjectId:\s*projectData\.id/,
      )
    }
  })
})
