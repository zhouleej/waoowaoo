import { z } from 'zod'

const frame = z.number().int().min(0).max(108000)
const source = z.string().min(1).max(4096)
const audio = z.object({ src: source, volume: z.number().min(0).max(2), voiceLineId: z.string().optional() })
const subtitle = z.object({ text: z.string().max(10000), style: z.enum(['default', 'cinematic']) })
const clip = z.object({
  id: z.string().min(1), src: source, durationInFrames: frame.min(1),
  trim: z.object({ from: frame, to: frame }).optional(),
  attachment: z.object({ audio: audio.optional(), subtitle: subtitle.optional() }).optional(),
  dialogue: z.array(z.object({ from: frame, durationInFrames: frame.min(1), audio: audio.optional(), subtitle: subtitle.optional() })).max(100).optional(),
  transition: z.object({ type: z.enum(['none', 'dissolve', 'fade', 'slide']), durationInFrames: frame.max(120) }).optional(),
  metadata: z.object({ panelId: z.string().min(1), storyboardId: z.string().min(1), description: z.string().optional() }),
})

export const editorProjectSchema = z.object({
  id: z.string().min(1), episodeId: z.string().min(1), schemaVersion: z.literal('1.0'),
  config: z.object({ fps: z.number().int().min(12).max(60), width: z.number().int().min(240).max(3840), height: z.number().int().min(240).max(3840) }),
  timeline: z.array(clip).max(500),
  bgmTrack: z.array(z.object({ id: z.string(), src: source, startFrame: frame, durationInFrames: frame.min(1), volume: z.number().min(0).max(2), fadeIn: frame.optional(), fadeOut: frame.optional() })).max(20),
}).superRefine((project, ctx) => {
  const ids = project.timeline.map((item) => item.id)
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', message: 'Duplicate clip ids' })
  if (project.config.width % 2 || project.config.height % 2) ctx.addIssue({ code: 'custom', message: 'Dimensions must be even' })
  if (project.timeline.reduce((total, item) => total + item.durationInFrames, 0) > project.config.fps * 1800) {
    ctx.addIssue({ code: 'custom', message: 'Maximum duration is 30 minutes' })
  }
  for (const item of project.timeline) {
    if (item.trim && item.trim.to <= item.trim.from) ctx.addIssue({ code: 'custom', message: 'Invalid trim range' })
    if (item.transition && item.transition.durationInFrames >= item.durationInFrames) ctx.addIssue({ code: 'custom', message: 'Transition exceeds clip length' })
    if (item.dialogue?.some((line) => line.from + line.durationInFrames > item.durationInFrames)) ctx.addIssue({ code: 'custom', message: 'Dialogue exceeds clip length' })
  }
})
