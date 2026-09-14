import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  invalidateQueriesMock,
  useMutationMock,
  requestJsonWithErrorMock,
} = vi.hoisted(() => ({
  invalidateQueriesMock: vi.fn(async () => undefined),
  useMutationMock: vi.fn((options: unknown) => options),
  requestJsonWithErrorMock: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: invalidateQueriesMock }),
  useMutation: (options: unknown) => useMutationMock(options),
}))

vi.mock('@/lib/query/mutations/mutation-shared', async () => {
  const actual = await vi.importActual<typeof import('@/lib/query/mutations/mutation-shared')>(
    '@/lib/query/mutations/mutation-shared',
  )
  return {
    ...actual,
    requestJsonWithError: requestJsonWithErrorMock,
  }
})

import { useSaveAssetHubCharacterDesignedVoice } from '@/lib/query/mutations/asset-hub-voice-mutations'

interface SaveCharacterVoiceMutation {
  mutationFn: (variables: {
    characterId: string
    voiceId: string
    audioBase64: string
  }) => Promise<unknown>
  onSuccess: () => Promise<void>
}

describe('asset hub character voice mutations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requestJsonWithErrorMock.mockResolvedValue({ success: true })
  })

  it('sends the nested voiceDesign contract expected by the character voice API', async () => {
    const mutation = useSaveAssetHubCharacterDesignedVoice() as unknown as SaveCharacterVoiceMutation

    await mutation.mutationFn({
      characterId: 'character-1',
      voiceId: 'voice-1',
      audioBase64: 'base64-audio',
    })

    expect(requestJsonWithErrorMock).toHaveBeenCalledWith(
      '/api/asset-hub/character-voice',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterId: 'character-1',
          voiceDesign: {
            voiceId: 'voice-1',
            audioBase64: 'base64-audio',
          },
        }),
      },
      'Failed to save designed character voice',
    )
  })

  it('refreshes both unified and legacy character queries after saving', async () => {
    const mutation = useSaveAssetHubCharacterDesignedVoice() as unknown as SaveCharacterVoiceMutation

    await mutation.onSuccess()

    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['global-assets', 'unified'],
    })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['global-assets', 'characters'],
    })
  })
})
