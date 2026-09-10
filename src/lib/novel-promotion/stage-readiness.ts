export type StageArtifactReadiness = {
  hasStory: boolean
  hasScript: boolean
  hasStoryboard: boolean
  hasVideo: boolean
  hasVoice: boolean
  completion?: { script: boolean; storyboard: boolean; video: boolean; voice: boolean }
}

type EpisodeClipLike = {
  screenplay?: string | null
  [key: string]: unknown
}

type StoryboardPanelLike = {
  videoUrl?: string | null
  [key: string]: unknown
}

type StoryboardLike = {
  panels?: StoryboardPanelLike[] | null
  [key: string]: unknown
}

type EpisodeLike = {
  novelText?: string | null
  clips?: unknown[] | null
  storyboards?: unknown[] | null
  voiceLines?: unknown[] | null
}

function hasNonEmptyText(value: string | null | undefined) {
  return typeof value === 'string' && value.trim().length > 0
}

function isEpisodeClipLike(value: unknown): value is EpisodeClipLike {
  return typeof value === 'object' && value !== null
}

function isStoryboardPanelLike(value: unknown): value is StoryboardPanelLike {
  return typeof value === 'object' && value !== null
}

function isStoryboardLike(value: unknown): value is StoryboardLike {
  return typeof value === 'object' && value !== null
}

export function hasScriptArtifacts(clips: unknown[] | null | undefined) {
  if (!Array.isArray(clips) || clips.length === 0) return false
  return clips.some((clip) => isEpisodeClipLike(clip) && hasNonEmptyText(clip.screenplay))
}

export function hasStoryboardArtifacts(storyboards: unknown[] | null | undefined) {
  if (!Array.isArray(storyboards) || storyboards.length === 0) return false
  return storyboards.some((storyboard) => isStoryboardLike(storyboard)
    && Array.isArray(storyboard.panels)
    && storyboard.panels.some((panel) => isStoryboardPanelLike(panel)))
}

export function hasVideoArtifacts(storyboards: unknown[] | null | undefined) {
  if (!Array.isArray(storyboards) || storyboards.length === 0) return false
  return storyboards.some((storyboard) => isStoryboardLike(storyboard)
    && Array.isArray(storyboard.panels)
    && storyboard.panels.some((panel) => isStoryboardPanelLike(panel) && hasNonEmptyText(panel.videoUrl)))
}

export function resolveEpisodeStageArtifacts(episode: EpisodeLike | null | undefined): StageArtifactReadiness {
  const clips = Array.isArray(episode?.clips) ? episode.clips : []
  const storyboards = Array.isArray(episode?.storyboards) ? episode.storyboards : []
  const panels = storyboards.flatMap((item) => isStoryboardLike(item) && Array.isArray(item.panels) ? item.panels : [])
  const voiceLines = Array.isArray(episode?.voiceLines) ? episode.voiceLines : []
  return {
    hasStory: hasNonEmptyText(episode?.novelText),
    hasScript: hasScriptArtifacts(episode?.clips),
    hasStoryboard: hasStoryboardArtifacts(episode?.storyboards),
    hasVideo: hasVideoArtifacts(episode?.storyboards),
    hasVoice: Array.isArray(episode?.voiceLines) && episode.voiceLines.length > 0,
    completion: {
      script: clips.length > 0 && clips.every((clip) => isEpisodeClipLike(clip) && hasNonEmptyText(clip.screenplay)),
      storyboard: clips.length > 0 && storyboards.length >= clips.length && storyboards.every((item) => isStoryboardLike(item) && !!item.panels?.length),
      video: panels.length > 0 && panels.every((panel) => hasNonEmptyText(panel.videoUrl)),
      voice: voiceLines.length > 0 && voiceLines.every((line) => !!line && typeof line === 'object' && hasNonEmptyText((line as { audioUrl?: string }).audioUrl)),
    },
  }
}
