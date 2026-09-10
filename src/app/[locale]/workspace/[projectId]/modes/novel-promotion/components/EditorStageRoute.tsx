'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { apiFetch } from '@/lib/api-fetch'
import { VideoEditorStage } from '@/features/video-editor/components/VideoEditorStage'
import type { VideoEditorProject } from '@/features/video-editor/types/editor.types'
import { assembleEditorProject } from '@/features/video-editor/utils/assemble-project'
import { useWorkspaceProvider } from '../WorkspaceProvider'
import { useWorkspaceStageRuntime } from '../WorkspaceStageRuntimeContext'
import type { NovelPromotionClip, NovelPromotionStoryboard } from '@/types/project'

export default function EditorStageRoute() {
  const { projectId, episodeId } = useWorkspaceProvider()
  const runtime = useWorkspaceStageRuntime()
  const [project, setProject] = useState<VideoEditorProject | null>(null)
  const [error, setError] = useState('')
  const t = useTranslations('video')
  useEffect(() => {
    if (!episodeId) return
    let active = true
    setProject(null)
    setError('')
    void (async () => {
      const response = await apiFetch(`/api/novel-promotion/${projectId}/editor?episodeId=${episodeId}`)
      if (!response.ok) throw new Error(t('editor.alert.loadFailed'))
      const saved = await response.json()
      if (saved.projectData) {
        if (active) setProject({ ...saved.projectData, id: saved.id })
        return
      }
      const voiceResponse = await apiFetch(`/api/novel-promotion/${projectId}/voice-lines?episodeId=${episodeId}`)
      if (!voiceResponse.ok) throw new Error(t('editor.alert.loadFailed'))
      const voices = await voiceResponse.json()
      const episodeResponse = await apiFetch(`/api/novel-promotion/${projectId}/episodes/${episodeId}`)
      if (!episodeResponse.ok) throw new Error(t('editor.alert.loadFailed'))
      const { episode } = await episodeResponse.json() as { episode: { clips: NovelPromotionClip[]; storyboards: NovelPromotionStoryboard[] } }
      const { clips, storyboards } = episode
      const ordered = [...storyboards].sort((a, b) => clips.findIndex((clip) => clip.id === a.clipId) - clips.findIndex((clip) => clip.id === b.clipId))
      const panels = ordered.flatMap((storyboard) => [...(storyboard.panels || [])].sort((a, b) => a.panelIndex - b.panelIndex))
      if (active) setProject(assembleEditorProject(episodeId, panels, voices.voiceLines || [], runtime.videoRatio || '16:9'))
    })().catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)) })
    return () => { active = false }
  // Mount per episode. Live generation updates must not overwrite an edited timeline.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, episodeId])

  if (error) return <div role="alert" className="p-6">{error}</div>
  if (!project || !episodeId) return <div className="p-6">{t('editor.loading')}</div>
  return <VideoEditorStage key={episodeId} projectId={projectId} episodeId={episodeId} initialProject={project} onBack={() => runtime.onStageChange('videos')} />
}
