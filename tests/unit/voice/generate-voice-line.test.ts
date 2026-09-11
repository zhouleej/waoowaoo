import { beforeEach, describe, expect, it, vi } from 'vitest'

const prismaMock = vi.hoisted(() => ({
  novelPromotionVoiceLine: {
    findUnique: vi.fn(),
    update: vi.fn(async () => undefined),
    updateMany: vi.fn(async () => ({ count: 1 })),
  },
  novelPromotionProject: {
    findUnique: vi.fn(),
  },
  novelPromotionEpisode: {
    findUnique: vi.fn(),
  },
  novelPromotionPanel: { updateMany: vi.fn(async () => ({ count: 1 })) },
  $transaction: vi.fn(),
}))

const resolveModelSelectionOrSingleMock = vi.hoisted(() => vi.fn())
const getProviderKeyMock = vi.hoisted(() => vi.fn((providerId: string) => providerId))
const getAudioApiKeyMock = vi.hoisted(() => vi.fn())

const normalizeToBase64ForGenerationMock = vi.hoisted(() => vi.fn())
const extractStorageKeyMock = vi.hoisted(() => vi.fn())
const getSignedUrlMock = vi.hoisted(() => vi.fn((storageKey: string) => `signed://${storageKey}`))
const toFetchableUrlMock = vi.hoisted(() => vi.fn((url: string) => url))
const uploadObjectMock = vi.hoisted(() => vi.fn(async () => 'voice/storage/line-1.wav'))
const resolveStorageKeyFromMediaValueMock = vi.hoisted(() => vi.fn())
const synthesizeWithBailianTTSMock = vi.hoisted(() => vi.fn())
const falSubscribeMock = vi.hoisted(() => vi.fn())
const getProviderConfigMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))

vi.mock('@/lib/api-config', () => ({
  getAudioApiKey: getAudioApiKeyMock,
  getProviderConfig: getProviderConfigMock,
  getProviderKey: getProviderKeyMock,
  resolveModelSelectionOrSingle: resolveModelSelectionOrSingleMock,
}))

vi.mock('@/lib/media/outbound-image', () => ({
  normalizeToBase64ForGeneration: normalizeToBase64ForGenerationMock,
}))

vi.mock('@/lib/storage', () => ({
  extractStorageKey: extractStorageKeyMock,
  getSignedUrl: getSignedUrlMock,
  toFetchableUrl: toFetchableUrlMock,
  uploadObject: uploadObjectMock,
}))

vi.mock('@/lib/media/service', () => ({
  resolveStorageKeyFromMediaValue: resolveStorageKeyFromMediaValueMock,
}))

vi.mock('@/lib/providers/bailian', () => ({
  synthesizeWithBailianTTS: synthesizeWithBailianTTSMock,
}))

vi.mock('@fal-ai/client', () => ({
  fal: {
    config: vi.fn(),
    subscribe: falSubscribeMock,
  },
}))

import { generateVoiceLine } from '@/lib/voice/generate-voice-line'

describe('generate voice line with bailian provider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.$transaction.mockImplementation(async (fn) => fn(prismaMock))
    prismaMock.novelPromotionVoiceLine.updateMany.mockResolvedValue({ count: 1 })
    const audioBytes = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])

    prismaMock.novelPromotionVoiceLine.findUnique.mockResolvedValue({
      id: 'line-1',
      episodeId: 'episode-1',
      speaker: 'Narrator',
      content: '你好，世界',
      emotionPrompt: null,
      emotionStrength: null,
      updatedAt: new Date('2026-09-11T00:00:00Z'),
    })
    prismaMock.novelPromotionProject.findUnique.mockResolvedValue({
      characters: [],
    })
    prismaMock.novelPromotionEpisode.findUnique.mockResolvedValue({
      speakerVoices: JSON.stringify({
        Narrator: {
          audioUrl: 'voice/reference.wav',
          voiceId: 'voice_abc123',
        },
      }),
    })

    resolveModelSelectionOrSingleMock.mockResolvedValue({
      provider: 'bailian',
      modelId: 'qwen3-tts-vd-2026-01-26',
      modelKey: 'bailian::qwen3-tts-vd-2026-01-26',
      mediaType: 'audio',
    })

    getProviderConfigMock.mockResolvedValue({
      id: 'bailian',
      name: 'Alibaba Bailian',
      apiKey: 'bl-key',
    })
    synthesizeWithBailianTTSMock.mockResolvedValue({
      success: true,
      audioData: Buffer.from(audioBytes),
      audioDuration: 1,
    })
  })

  it('uses speaker voiceId to generate and persists uploaded audio', async () => {
    const result = await generateVoiceLine({
      projectId: 'project-1',
      episodeId: 'episode-1',
      lineId: 'line-1',
      userId: 'user-1',
      audioModel: 'bailian::qwen3-tts-vd-2026-01-26',
    })

    expect(getProviderConfigMock).toHaveBeenCalledWith('user-1', 'bailian')
    expect(synthesizeWithBailianTTSMock).toHaveBeenCalledWith({
      text: '你好，世界',
      voiceId: 'voice_abc123',
      modelId: 'qwen3-tts-vd-2026-01-26',
      languageType: 'Chinese',
    }, 'bl-key')
    expect(uploadObjectMock).toHaveBeenCalledTimes(1)
    expect(prismaMock.novelPromotionVoiceLine.updateMany).toHaveBeenCalledWith({
      where: { id: 'line-1', updatedAt: new Date('2026-09-11T00:00:00Z') },
      data: {
        audioUrl: 'voice/storage/line-1.wav',
        audioMediaId: null,
        audioDuration: 1,
      },
    })
    expect(prismaMock.novelPromotionPanel.updateMany).toHaveBeenCalledWith({
      where: { matchedVoiceLines: { some: { id: 'line-1' } } },
      data: { lipSyncVideoUrl: null, lipSyncVideoMediaId: null, lipSyncTaskId: null },
    })
    expect(result).toEqual({
      lineId: 'line-1',
      audioUrl: 'signed://voice/storage/line-1.wav',
      storageKey: 'voice/storage/line-1.wav',
      audioDuration: 1,
    })
  })

  it('fails explicitly when bailian speaker binding only has uploaded audio', async () => {
    prismaMock.novelPromotionEpisode.findUnique.mockResolvedValueOnce({
      speakerVoices: JSON.stringify({
        Narrator: {
          audioUrl: 'voice/reference.wav',
        },
      }),
    })

    await expect(
      generateVoiceLine({
        projectId: 'project-1',
        episodeId: 'episode-1',
        lineId: 'line-1',
        userId: 'user-1',
        audioModel: 'bailian::qwen3-tts-vd-2026-01-26',
      }),
    ).rejects.toThrow('无音色ID，QwenTTS 必须使用 AI 设计音色')

    expect(synthesizeWithBailianTTSMock).not.toHaveBeenCalled()
    expect(uploadObjectMock).not.toHaveBeenCalled()
  })

  it('maps bailian invalid parameter to a qwen voice guidance error', async () => {
    synthesizeWithBailianTTSMock.mockResolvedValueOnce({
      success: false,
      error: 'BAILIAN_TTS_FAILED(400): InvalidParameter',
    })

    await expect(
      generateVoiceLine({
        projectId: 'project-1',
        episodeId: 'episode-1',
        lineId: 'line-1',
        userId: 'user-1',
        audioModel: 'bailian::qwen3-tts-vd-2026-01-26',
      }),
    ).rejects.toThrow('无效音色ID，QwenTTS 必须使用 AI 设计音色')

    expect(uploadObjectMock).not.toHaveBeenCalled()
  })

  it('does not upload or attach audio after cancellation', async () => {
    const checkCancelled = vi.fn(async () => { throw new Error('cancelled') })
    await expect(generateVoiceLine({ projectId: 'project-1', lineId: 'line-1', userId: 'user-1', checkCancelled }))
      .rejects.toThrow('cancelled')
    expect(uploadObjectMock).not.toHaveBeenCalled()
    expect(prismaMock.novelPromotionVoiceLine.update).not.toHaveBeenCalled()
  })

  it('never overwrites the file referenced by an older voice version', async () => {
    const input = { projectId: 'project-1', lineId: 'line-1', userId: 'user-1' }
    await generateVoiceLine(input)
    await generateVoiceLine(input)
    const keys = uploadObjectMock.mock.calls.map((call) => (call as unknown[])[1])
    expect(new Set(keys).size).toBe(2)
  })

  it('rejects generated audio when dialogue changed during generation', async () => {
    synthesizeWithBailianTTSMock.mockImplementationOnce(async () => {
      prismaMock.novelPromotionVoiceLine.findUnique.mockResolvedValue({
        id: 'line-1', episodeId: 'episode-1', speaker: 'Narrator', content: '修改后的台词',
        emotionPrompt: null, emotionStrength: null, updatedAt: new Date('2026-09-11T01:00:00Z'),
      })
      return { success: true, audioData: Buffer.from('generated audio'), audioDuration: 1000 }
    })
    await expect(generateVoiceLine({ projectId: 'project-1', lineId: 'line-1', userId: 'user-1' }))
      .rejects.toThrow('VOICE_SOURCE_CHANGED')
    expect(prismaMock.novelPromotionVoiceLine.update).not.toHaveBeenCalled()
  })

  it('does not attach the old audio when the line changes during upload', async () => {
    prismaMock.novelPromotionVoiceLine.updateMany.mockResolvedValueOnce({ count: 0 })
    await expect(generateVoiceLine({ projectId: 'project-1', lineId: 'line-1', userId: 'user-1' }))
      .rejects.toThrow('VOICE_SOURCE_CHANGED')
    expect(prismaMock.novelPromotionPanel.updateMany).not.toHaveBeenCalled()
  })
})
