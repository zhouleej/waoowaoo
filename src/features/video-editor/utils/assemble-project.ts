import type { VideoEditorProject } from '../types/editor.types'

type Panel = { id: string; storyboardId: string; videoUrl?: string | null; lipSyncVideoUrl?: string | null; duration?: number | null; description?: string | null }
type Voice = { id: string; matchedPanelId?: string | null; lineIndex?: number; content: string; audioUrl?: string | null; audioDuration?: number | null }

export function assembleEditorProject(episodeId: string, panels: Panel[], voices: Voice[], ratio = '16:9'): VideoEditorProject {
  const [width, height] = ratio === '9:16' ? [1080, 1920] : ratio === '1:1' ? [1080, 1080] : [1920, 1080]
  return {
    id: `editor_${episodeId}`, episodeId, schemaVersion: '1.0', config: { fps: 30, width, height }, bgmTrack: [],
    timeline: panels.filter((panel) => panel.videoUrl || panel.lipSyncVideoUrl).map((panel) => {
      let cursor = 0
      const dialogue = voices.filter((line) => line.matchedPanelId === panel.id)
        .sort((a, b) => (a.lineIndex || 0) - (b.lineIndex || 0)).map((line) => {
          const durationInFrames = Math.max(1, Math.round((line.audioDuration ? line.audioDuration / 1000 : 3) * 30))
          const from = cursor
          cursor += durationInFrames
          return { from, durationInFrames,
            audio: line.audioUrl ? { src: line.audioUrl, volume: 1, voiceLineId: line.id } : undefined,
            subtitle: { text: line.content, style: 'default' as const },
          }
        })
      // One lip-sync output is based on one selected line. For multi-line shots,
      // use the base clip and lay out all dialogue instead of dropping later lines.
      const useLipSync = !!panel.lipSyncVideoUrl && (dialogue.length <= 1 || !panel.videoUrl)
      return {
        id: `clip_${panel.id}`, src: useLipSync ? panel.lipSyncVideoUrl! : panel.videoUrl!,
        durationInFrames: Math.max(Math.round((panel.duration || 3) * 30), cursor),
        // Lip-sync output already contains audio. Do not overlay it a second time.
        dialogue: useLipSync ? dialogue.map((line) => ({ ...line, audio: undefined })) : dialogue,
        metadata: { panelId: panel.id, storyboardId: panel.storyboardId, description: panel.description || undefined },
      }
    }),
  }
}
