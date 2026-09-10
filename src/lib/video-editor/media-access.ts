import { prisma } from '@/lib/prisma'
import { resolveStorageKeyFromMediaValue } from '@/lib/media/service'
import type { VideoEditorProject } from '@/features/video-editor/types/editor.types'

/** Resolve only media referenced by this episode. User-supplied URLs are never fetched. */
export async function authorizeEditorMedia(projectId: string, project: VideoEditorProject) {
  const episode = await prisma.novelPromotionEpisode.findFirst({
    where: { id: project.episodeId, novelPromotionProject: { projectId } },
    include: { storyboards: { include: { panels: true } }, voiceLines: true },
  })
  if (!episode) throw new Error('EDITOR_EPISODE_NOT_FOUND')
  const panels = new Map(episode.storyboards.flatMap((item) => item.panels).map((panel) => [panel.id, panel]))
  const voices = new Map(episode.voiceLines.map((line) => [line.id, line]))
  const result = structuredClone(project)
  const keys = new Set<string>()
  const resolve = async (value: string, allowed: Array<string | null>) => {
    const key = await resolveStorageKeyFromMediaValue(value)
    const allowedKeys = await Promise.all(allowed.filter(Boolean).map(resolveStorageKeyFromMediaValue))
    if (!key || /^https?:/i.test(key) || !allowedKeys.includes(key)) throw new Error('EDITOR_MEDIA_CHANGED_OR_FORBIDDEN')
    keys.add(key)
    return key
  }
  for (const clip of result.timeline) {
    const panel = panels.get(clip.metadata.panelId)
    if (!panel || panel.storyboardId !== clip.metadata.storyboardId) throw new Error('EDITOR_PANEL_NOT_FOUND')
    clip.src = await resolve(clip.src, [panel.videoUrl, panel.lipSyncVideoUrl])
    for (const attachment of [clip.attachment, ...(clip.dialogue || [])]) {
      if (!attachment?.audio) continue
      const voice = voices.get(attachment.audio.voiceLineId || '')
      if (!voice || voice.matchedPanelId !== panel.id || !voice.audioUrl) throw new Error('EDITOR_VOICE_CHANGED_OR_UNBOUND')
      attachment.audio.src = await resolve(attachment.audio.src, [voice.audioUrl])
    }
  }
  for (const bgm of result.bgmTrack) {
    bgm.src = await resolve(bgm.src, [episode.audioUrl, ...episode.voiceLines.map((line) => line.audioUrl)])
  }
  return { project: result, keys: [...keys] }
}
