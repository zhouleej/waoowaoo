import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

const authMock = vi.hoisted(() => ({
  requireUserAuth: vi.fn(async () => ({
    session: { user: { id: 'user-1' } },
  })),
  isErrorResponse: vi.fn((value: unknown) => value instanceof Response),
}))

const prismaMock = vi.hoisted(() => ({
  globalCharacter: {
    findFirst: vi.fn(async () => ({ id: 'character-1' })),
    update: vi.fn(async () => ({ id: 'character-1' })),
  },
}))

const storageMock = vi.hoisted(() => ({
  uploadObject: vi.fn(async () => 'global-voice/user-1/character-1/designed.wav'),
  generateUniqueKey: vi.fn(() => 'global-voice/user-1/character-1/designed.wav'),
  getSignedUrl: vi.fn(() => 'https://storage.example.com/designed.wav'),
}))

const mediaMock = vi.hoisted(() => ({
  resolveMediaRefFromLegacyValue: vi.fn(async () => ({ id: 'media-1' })),
}))

vi.mock('@/lib/api-auth', () => authMock)
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/storage', () => storageMock)
vi.mock('@/lib/media/service', () => mediaMock)

describe('api contract - asset hub character voice', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('associates the selected AI-designed voice and its media with the character', async () => {
    const mod = await import('@/app/api/asset-hub/character-voice/route')
    const req = buildMockRequest({
      path: '/api/asset-hub/character-voice',
      method: 'POST',
      body: {
        characterId: 'character-1',
        voiceDesign: {
          voiceId: 'voice-provider-1',
          audioBase64: Buffer.from('audio').toString('base64'),
        },
      },
    })

    const res = await mod.POST(req, { params: Promise.resolve({}) })

    expect(res.status).toBe(200)
    expect(prismaMock.globalCharacter.findFirst).toHaveBeenCalledWith({
      where: { id: 'character-1', userId: 'user-1' },
    })
    expect(prismaMock.globalCharacter.update).toHaveBeenCalledWith({
      where: { id: 'character-1' },
      data: {
        voiceType: 'qwen-designed',
        voiceId: 'voice-provider-1',
        customVoiceUrl: 'global-voice/user-1/character-1/designed.wav',
        customVoiceMediaId: 'media-1',
        globalVoiceId: null,
      },
    })
  })
})
