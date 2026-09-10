import { describe, expect, it } from 'vitest'
import { assembleEditorProject } from '@/features/video-editor/utils/assemble-project'
import { editorProjectSchema } from '@/features/video-editor/utils/project-schema'

describe('editor assembly', () => {
  it('binds multiple voice lines by panel identity and inherits portrait ratio', () => {
    const project = assembleEditorProject('ep', [
      { id: 'missing', storyboardId: 's' }, { id: 'second', storyboardId: 's', videoUrl: 'second.mp4', lipSyncVideoUrl: 'single-line.mp4' },
    ], [
      { id: 'a', matchedPanelId: 'missing', content: 'Not for second', audioUrl: 'a.wav' },
      { id: 'b', matchedPanelId: 'second', content: 'First', lineIndex: 2, audioDuration: 2000, audioUrl: 'b.wav' },
      { id: 'c', matchedPanelId: 'second', content: 'Second', lineIndex: 3, audioDuration: 2000, audioUrl: 'c.wav' },
    ], '9:16')
    expect(project.config).toEqual({ fps: 30, width: 1080, height: 1920 })
    expect(project.timeline[0].src).toBe('second.mp4')
    expect(project.timeline[0].dialogue?.map((line) => line.audio?.voiceLineId)).toEqual(['b', 'c'])
    expect(project.timeline[0].durationInFrames).toBe(120)
    expect(editorProjectSchema.safeParse(project).success).toBe(true)
  })
  it('rejects invalid dimensions and duplicate clips', () => {
    const project = assembleEditorProject('ep', [{ id: 'p', storyboardId: 's', videoUrl: 'p.mp4' }], [])
    project.config.width = 1921
    project.timeline.push(project.timeline[0])
    expect(editorProjectSchema.safeParse(project).success).toBe(false)
  })
})
