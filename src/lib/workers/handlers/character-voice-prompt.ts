import type { Job } from 'bullmq'
import { prisma } from '@/lib/prisma'
import { executeAiTextStep } from '@/lib/ai-runtime'
import { withInternalLLMStreamCallbacks } from '@/lib/llm-observe/internal-stream-context'
import { buildPrompt, PROMPT_IDS } from '@/lib/prompt-i18n'
import { validateVoicePrompt } from '@/lib/providers/bailian/voice-design'
import { reportTaskProgress } from '@/lib/workers/shared'
import { assertTaskActive } from '@/lib/workers/utils'
import type { TaskJobData } from '@/lib/task/types'
import { createWorkerLLMStreamCallbacks, createWorkerLLMStreamContext } from './llm-stream'
import { resolveAnalysisModel } from './resolve-analysis-model'

const MAX_REPRESENTATIVE_LINES = 12
const MAX_SCRIPT_EXCERPTS = 6
const MAX_LINE_CHARS = 160
const MAX_EXCERPT_CHARS = 360
const MAX_CANDIDATE_LINES = 80
const MAX_CANDIDATE_CLIPS = 120

type JsonRecord = Record<string, unknown>

function asRecord(value: unknown): JsonRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as JsonRecord
    : null
}

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/[\s“”"'「」『』]/g, '')
}

export function parseCharacterAliases(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === 'string' && !!item.trim())
    }
  } catch {
    // 兼容旧数据中的逗号、顿号和斜杠分隔格式。
  }
  return raw
    .split(/[,，、/]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function speakerMatches(speaker: string, names: string[]): boolean {
  const normalizedSpeaker = normalizeName(speaker)
  return names.some((name) => normalizeName(name) === normalizedSpeaker)
}

function parseClipCharacterNames(raw: string | null): string[] {
  if (!raw?.trim()) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((item) => {
        if (typeof item === 'string') return item
        const record = asRecord(item)
        return typeof record?.name === 'string' ? record.name : ''
      })
      .filter(Boolean)
  } catch {
    return raw.split(/[,，、/]/).map((item) => item.trim()).filter(Boolean)
  }
}

function truncateText(value: string, maxChars: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxChars) return normalized
  return `${normalized.slice(0, Math.max(1, maxChars - 1))}…`
}

function collectNameExcerpts(text: string, names: string[]): string[] {
  const excerpts: string[] = []
  const normalizedText = text.trim()
  if (!normalizedText) return excerpts
  const lowerText = normalizedText.toLocaleLowerCase()

  for (const name of names) {
    const needle = name.trim().toLocaleLowerCase()
    if (!needle) continue
    let fromIndex = 0
    while (excerpts.length < MAX_SCRIPT_EXCERPTS) {
      const foundIndex = lowerText.indexOf(needle, fromIndex)
      if (foundIndex < 0) break
      const start = Math.max(0, foundIndex - 130)
      const end = Math.min(normalizedText.length, foundIndex + needle.length + 220)
      excerpts.push(truncateText(normalizedText.slice(start, end), MAX_EXCERPT_CHARS))
      fromIndex = foundIndex + needle.length
    }
    if (excerpts.length >= MAX_SCRIPT_EXCERPTS) break
  }

  return excerpts
}

function parseProfileData(raw: string | null): JsonRecord | null {
  if (!raw?.trim()) return null
  try {
    return asRecord(JSON.parse(raw))
  } catch {
    return null
  }
}

function formatProfile(raw: string | null): string {
  const profile = parseProfileData(raw)
  if (!profile) return '暂无结构化人物档案'
  const labels: Array<[string, unknown]> = [
    ['角色原型', profile.archetype],
    ['性格标签', profile.personality_tags],
    ['性别', profile.gender],
    ['年龄段', profile.age_range],
    ['社会阶层', profile.social_class],
    ['职业', profile.occupation],
    ['时代背景', profile.era_period],
  ]
  const values = labels.flatMap(([label, value]) => {
    if (Array.isArray(value)) {
      const items = value.filter((item): item is string => typeof item === 'string' && !!item.trim())
      return items.length > 0 ? [`${label}：${items.join('、')}`] : []
    }
    return typeof value === 'string' && value.trim() ? [`${label}：${value.trim()}`] : []
  })
  return values.length > 0 ? values.join('；') : '暂无结构化人物档案'
}

export function parseCharacterVoicePromptResponse(responseText: string): string {
  const cleaned = responseText
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/, '')
    .replace(/\s*```$/, '')

  let voicePrompt = ''
  const firstBrace = cleaned.indexOf('{')
  const lastBrace = cleaned.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    try {
      const parsed = asRecord(JSON.parse(cleaned.slice(firstBrace, lastBrace + 1)))
      voicePrompt = typeof parsed?.voicePrompt === 'string' ? parsed.voicePrompt : ''
    } catch {
      throw new Error('VOICE_PROMPT_INVALID_RESULT')
    }
    if (!voicePrompt) throw new Error('VOICE_PROMPT_INVALID_RESULT')
  } else {
    voicePrompt = cleaned.replace(/^voicePrompt\s*[:：]\s*/i, '')
  }

  const normalized = voicePrompt.replace(/\s+/g, ' ').trim().slice(0, 500)
  const validation = validateVoicePrompt(normalized)
  if (!validation.valid) {
    throw new Error(validation.error || 'VOICE_PROMPT_INVALID_RESULT')
  }
  return normalized
}

export async function handleCharacterVoicePromptTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as Record<string, unknown>
  const characterId = typeof payload.characterId === 'string' ? payload.characterId.trim() : ''
  if (!characterId) throw new Error('characterId is required')

  const novelData = await prisma.novelPromotionProject.findUnique({
    where: { projectId: job.data.projectId },
    select: {
      id: true,
      analysisModel: true,
      characters: {
        where: { id: characterId },
        select: {
          id: true,
          name: true,
          aliases: true,
          introduction: true,
          profileData: true,
        },
      },
      episodes: {
        orderBy: { episodeNumber: 'asc' },
        take: 20,
        select: {
          id: true,
          novelText: true,
        },
      },
    },
  })
  if (!novelData) throw new Error('Novel promotion data not found')
  const character = novelData.characters[0]
  if (!character) throw new Error('Character not found in project')

  const names = Array.from(new Set([character.name, ...parseCharacterAliases(character.aliases)]))
  const episodeIds = novelData.episodes.map((episode) => episode.id)
  const [candidateLines, candidateClips] = episodeIds.length > 0
    ? await Promise.all([
        prisma.novelPromotionVoiceLine.findMany({
          where: {
            episodeId: { in: episodeIds },
            speaker: { in: names },
          },
          orderBy: { lineIndex: 'asc' },
          take: MAX_CANDIDATE_LINES,
          select: {
            speaker: true,
            content: true,
          },
        }),
        prisma.novelPromotionClip.findMany({
          where: {
            episodeId: { in: episodeIds },
            OR: names.map((name) => ({ characters: { contains: name } })),
          },
          orderBy: { createdAt: 'asc' },
          take: MAX_CANDIDATE_CLIPS,
          select: {
            characters: true,
            content: true,
            screenplay: true,
          },
        }),
      ])
    : [[], []]
  const representativeLines: string[] = []
  const scriptExcerpts: string[] = []
  const seenLines = new Set<string>()
  const seenExcerpts = new Set<string>()

  for (const line of candidateLines) {
    if (representativeLines.length >= MAX_REPRESENTATIVE_LINES) break
    if (!speakerMatches(line.speaker, names)) continue
    const content = truncateText(line.content, MAX_LINE_CHARS)
    if (!content || seenLines.has(content)) continue
    seenLines.add(content)
    representativeLines.push(content)
  }

  for (const clip of candidateClips) {
    if (scriptExcerpts.length >= MAX_SCRIPT_EXCERPTS) break
    if (!parseClipCharacterNames(clip.characters).some((name) => speakerMatches(name, names))) continue
    const excerpt = truncateText(clip.screenplay || clip.content || '', MAX_EXCERPT_CHARS)
    if (!excerpt || seenExcerpts.has(excerpt)) continue
    seenExcerpts.add(excerpt)
    scriptExcerpts.push(excerpt)
  }

  for (const episode of novelData.episodes) {
    if (scriptExcerpts.length < MAX_SCRIPT_EXCERPTS && episode.novelText) {
      for (const excerpt of collectNameExcerpts(episode.novelText, names)) {
        if (scriptExcerpts.length >= MAX_SCRIPT_EXCERPTS) break
        if (seenExcerpts.has(excerpt)) continue
        seenExcerpts.add(excerpt)
        scriptExcerpts.push(excerpt)
      }
    }
  }

  const characterProfile = formatProfile(character.profileData)
  const characterIntroduction = character.introduction?.trim() || '暂无人物介绍'
  const hasCharacterEvidence = characterProfile !== '暂无结构化人物档案'
    || characterIntroduction !== '暂无人物介绍'
  if (!hasCharacterEvidence && representativeLines.length === 0 && scriptExcerpts.length === 0) {
    throw new Error('VOICE_PROMPT_CONTEXT_INSUFFICIENT')
  }

  const analysisModel = await resolveAnalysisModel({
    userId: job.data.userId,
    inputModel: payload.model,
    projectAnalysisModel: novelData.analysisModel,
  })
  const prompt = buildPrompt({
    promptId: PROMPT_IDS.NP_CHARACTER_VOICE_PROMPT,
    locale: job.data.locale,
    variables: {
      character_name: character.name,
      character_profile: characterProfile,
      character_introduction: characterIntroduction,
      representative_lines: representativeLines.length > 0
        ? representativeLines.map((line, index) => `${index + 1}. ${line}`).join('\n')
        : '暂无已识别台词',
      script_context: scriptExcerpts.length > 0
        ? scriptExcerpts.map((excerpt, index) => `${index + 1}. ${excerpt}`).join('\n')
        : '暂无相关剧本片段',
    },
  })

  await reportTaskProgress(job, 20, {
    stage: 'character_voice_prompt_prepare',
    stageLabel: '分析角色声音特点',
    displayMode: 'loading',
  })
  await assertTaskActive(job, 'character_voice_prompt_prepare')

  const streamContext = createWorkerLLMStreamContext(job, 'character_voice_prompt')
  const streamCallbacks = createWorkerLLMStreamCallbacks(job, streamContext)
  let responseText = ''
  try {
    const completion = await withInternalLLMStreamCallbacks(
      streamCallbacks,
      async () => await executeAiTextStep({
        userId: job.data.userId,
        model: analysisModel,
        messages: [{ role: 'user', content: prompt }],
        projectId: job.data.projectId,
        action: 'character_voice_prompt_analyze',
        meta: {
          stepId: 'character_voice_prompt_analyze',
          stepTitle: '分析角色声音特点',
          stepIndex: 1,
          stepTotal: 1,
        },
      }),
    )
    responseText = completion.text
  } finally {
    await streamCallbacks.flush()
  }

  await assertTaskActive(job, 'character_voice_prompt_parse')
  const voicePrompt = parseCharacterVoicePromptResponse(responseText)
  await reportTaskProgress(job, 96, {
    stage: 'character_voice_prompt_done',
    stageLabel: '声音特点建议已生成',
    displayMode: 'loading',
  })

  return {
    characterId,
    voicePrompt,
    evidence: {
      representativeLineCount: representativeLines.length,
      scriptExcerptCount: scriptExcerpts.length,
    },
  }
}
