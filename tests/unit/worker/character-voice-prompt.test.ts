import type { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'

const prismaMock = vi.hoisted(() => ({
  novelPromotionProject: { findUnique: vi.fn() },
  novelPromotionVoiceLine: { findMany: vi.fn() },
  novelPromotionClip: { findMany: vi.fn() },
}))

const aiRuntimeMock = vi.hoisted(() => ({
  executeAiTextStep: vi.fn(),
}))

const promptMock = vi.hoisted(() => ({
  buildPrompt: vi.fn(() => 'character-voice-prompt'),
}))

const workerMock = vi.hoisted(() => ({
  reportTaskProgress: vi.fn(async () => undefined),
  assertTaskActive: vi.fn(async () => undefined),
  flush: vi.fn(async () => undefined),
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/ai-runtime', () => aiRuntimeMock)
vi.mock('@/lib/llm-observe/internal-stream-context', () => ({
  withInternalLLMStreamCallbacks: vi.fn(async (_callbacks: unknown, fn: () => Promise<unknown>) => await fn()),
}))
vi.mock('@/lib/prompt-i18n', () => ({
  PROMPT_IDS: { NP_CHARACTER_VOICE_PROMPT: 'np_character_voice_prompt' },
  buildPrompt: promptMock.buildPrompt,
}))
vi.mock('@/lib/workers/shared', () => ({ reportTaskProgress: workerMock.reportTaskProgress }))
vi.mock('@/lib/workers/utils', () => ({ assertTaskActive: workerMock.assertTaskActive }))
vi.mock('@/lib/workers/handlers/llm-stream', () => ({
  createWorkerLLMStreamContext: vi.fn(() => ({ streamRunId: 'run-1', nextSeqByStepLane: {} })),
  createWorkerLLMStreamCallbacks: vi.fn(() => ({
    onStage: vi.fn(),
    onChunk: vi.fn(),
    onComplete: vi.fn(),
    onError: vi.fn(),
    flush: workerMock.flush,
  })),
}))
vi.mock('@/lib/workers/handlers/resolve-analysis-model', () => ({
  resolveAnalysisModel: vi.fn(async () => 'analysis-provider::model-1'),
}))

import {
  handleCharacterVoicePromptTask,
  parseCharacterAliases,
  parseCharacterVoicePromptResponse,
} from '@/lib/workers/handlers/character-voice-prompt'

function buildJob(characterId = 'character-1'): Job<TaskJobData> {
  return {
    data: {
      taskId: 'task-character-voice-1',
      type: TASK_TYPE.VOICE_ANALYZE,
      locale: 'zh',
      projectId: 'project-1',
      targetType: 'NovelPromotionCharacter',
      targetId: characterId,
      payload: {
        analysisKind: 'character_voice_prompt',
        characterId,
      },
      userId: 'user-1',
    },
  } as unknown as Job<TaskJobData>
}

describe('character voice prompt worker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.novelPromotionProject.findUnique.mockResolvedValue({
      id: 'novel-project-1',
      analysisModel: 'analysis-provider::model-1',
      characters: [{
        id: 'character-1',
        name: '林舟',
        aliases: '["阿舟"]',
        introduction: '年轻侦探，冷静克制，但面对同伴时更柔和。',
        profileData: JSON.stringify({
          archetype: '青年侦探',
          personality_tags: ['冷静', '敏锐', '克制'],
          gender: '男',
          age_range: '二十多岁',
          occupation: '侦探',
          era_period: '现代',
        }),
      }],
      episodes: [{
        id: 'episode-1',
        novelText: '林舟停在门前，先让所有人保持安静，随后检查现场。',
      }],
    })
    prismaMock.novelPromotionVoiceLine.findMany.mockResolvedValue([
      { speaker: '阿舟', content: '都别动，先把现场完整保留下来。' },
    ])
    prismaMock.novelPromotionClip.findMany.mockResolvedValue([{
      characters: '["林舟"]',
      content: '林舟冷静地安排众人退出房间。',
      screenplay: '林舟压低声音，语速平稳地解释接下来的行动。',
    }])
    aiRuntimeMock.executeAiTextStep.mockResolvedValue({
      text: '{"voicePrompt":"二十多岁男性声线，音色清朗略低，语速平稳克制，吐字清楚利落；整体冷静敏锐，在关照同伴时保留轻微温和感，情绪起伏不夸张。"}',
    })
  })

  it('parses JSON and legacy aliases safely', () => {
    expect(parseCharacterAliases('["阿舟", "小林"]')).toEqual(['阿舟', '小林'])
    expect(parseCharacterAliases('阿舟，小林/林侦探')).toEqual(['阿舟', '小林', '林侦探'])
    expect(parseCharacterVoicePromptResponse('```json\n{"voicePrompt":"清朗、克制且吐字清楚"}\n```'))
      .toBe('清朗、克制且吐字清楚')
    expect(() => parseCharacterVoicePromptResponse('{"unexpected":"bad response"}'))
      .toThrow('VOICE_PROMPT_INVALID_RESULT')
  })

  it('uses character profile, aliases, dialogue and script context without generating audio', async () => {
    const result = await handleCharacterVoicePromptTask(buildJob())

    expect(result).toEqual({
      characterId: 'character-1',
      voicePrompt: '二十多岁男性声线，音色清朗略低，语速平稳克制，吐字清楚利落；整体冷静敏锐，在关照同伴时保留轻微温和感，情绪起伏不夸张。',
      evidence: {
        representativeLineCount: 1,
        scriptExcerptCount: 2,
      },
    })
    expect(promptMock.buildPrompt).toHaveBeenCalledWith(expect.objectContaining({
      promptId: 'np_character_voice_prompt',
      variables: expect.objectContaining({
        character_name: '林舟',
        representative_lines: expect.stringContaining('都别动'),
        script_context: expect.stringContaining('压低声音'),
      }),
    }))
    expect(aiRuntimeMock.executeAiTextStep).toHaveBeenCalledTimes(1)
    expect(aiRuntimeMock.executeAiTextStep).toHaveBeenCalledWith(expect.objectContaining({
      action: 'character_voice_prompt_analyze',
      messages: [{ role: 'user', content: 'character-voice-prompt' }],
    }))
    expect(workerMock.flush).toHaveBeenCalledTimes(1)
  })

  it('fails early when the character has no profile, introduction, dialogue or script context', async () => {
    prismaMock.novelPromotionProject.findUnique.mockResolvedValue({
      id: 'novel-project-1',
      analysisModel: 'analysis-provider::model-1',
      characters: [{
        id: 'character-1',
        name: '林舟',
        aliases: null,
        introduction: null,
        profileData: null,
      }],
      episodes: [{ id: 'episode-1', novelText: '' }],
    })
    prismaMock.novelPromotionVoiceLine.findMany.mockResolvedValue([])
    prismaMock.novelPromotionClip.findMany.mockResolvedValue([])

    await expect(handleCharacterVoicePromptTask(buildJob()))
      .rejects.toThrow('VOICE_PROMPT_CONTEXT_INSUFFICIENT')
    expect(aiRuntimeMock.executeAiTextStep).not.toHaveBeenCalled()
  })
})
