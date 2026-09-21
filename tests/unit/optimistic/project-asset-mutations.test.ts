import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Character, Location, Project } from '@/types/project'
import type { AssetSummary } from '@/lib/assets/contracts'
import type { ProjectAssetsData } from '@/lib/query/hooks/useProjectAssets'
import { queryKeys } from '@/lib/query/keys'
import { MockQueryClient } from '../../helpers/mock-query-client'

let queryClient = new MockQueryClient()
const useQueryClientMock = vi.fn(() => queryClient)
const useMutationMock = vi.fn((options: unknown) => options)

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react')
  return {
    ...actual,
    useRef: <T,>(value: T) => ({ current: value }),
  }
})

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => useQueryClientMock(),
  useMutation: (options: unknown) => useMutationMock(options),
}))

vi.mock('@/lib/query/mutations/mutation-shared', async () => {
  const actual = await vi.importActual<typeof import('@/lib/query/mutations/mutation-shared')>(
    '@/lib/query/mutations/mutation-shared',
  )
  return {
    ...actual,
    requestJsonWithError: vi.fn(),
    requestVoidWithError: vi.fn(),
    invalidateQueryTemplates: vi.fn(),
  }
})

import {
  useDeleteProjectCharacter,
  useSelectProjectCharacterImage,
} from '@/lib/query/mutations/character-base-mutations'
import { useSelectProjectLocationImage } from '@/lib/query/mutations/location-image-mutations'

interface SelectProjectCharacterMutation {
  onMutate: (variables: {
    characterId: string
    appearanceId: string
    imageIndex: number | null
  }) => Promise<unknown>
  onError: (error: unknown, variables: unknown, context: unknown) => void
}

interface SelectProjectLocationMutation {
  onMutate: (variables: {
    locationId: string
    imageIndex: number | null
  }) => Promise<unknown>
  onError: (error: unknown, variables: unknown, context: unknown) => void
}

interface DeleteProjectCharacterMutation {
  onMutate: (characterId: string) => Promise<unknown>
  onError: (error: unknown, characterId: string, context: unknown) => void
}

function buildCharacter(selectedIndex: number | null): Character {
  return {
    id: 'character-1',
    name: 'Hero',
    appearances: [{
      id: 'appearance-1',
      appearanceIndex: 0,
      changeReason: 'default',
      description: null,
      descriptions: null,
      imageUrl: selectedIndex === null ? null : `img-${selectedIndex}`,
      imageUrls: ['img-0', 'img-1', 'img-2'],
      previousImageUrl: null,
      previousImageUrls: [],
      previousDescription: null,
      previousDescriptions: null,
      selectedIndex,
    }],
  }
}

function buildAssets(selectedIndex: number | null): ProjectAssetsData {
  return {
    characters: [buildCharacter(selectedIndex)],
    locations: [] as Location[],
    props: [],
  }
}

function buildProject(selectedIndex: number | null): Project {
  return {
    novelPromotionData: {
      characters: [buildCharacter(selectedIndex)],
      locations: [],
      props: [],
    },
  } as unknown as Project
}

const capabilities = {
  canGenerate: true,
  canSelectRender: true,
  canRevertRender: true,
  canModifyRender: true,
  canUploadRender: true,
  canBindVoice: false,
  canCopyFromGlobal: true,
}

const idleTaskState = {
  isRunning: false,
  lastError: null,
}

function buildUnifiedCharacterAssets(selectedIndex: number | null): AssetSummary[] {
  return [{
    id: 'character-1',
    scope: 'project',
    kind: 'character',
    family: 'visual',
    name: 'Hero',
    folderId: null,
    capabilities,
    taskRefs: [],
    taskState: idleTaskState,
    variants: [{
      id: 'appearance-1',
      index: 0,
      label: 'default',
      description: null,
      selectionState: { selectedRenderIndex: selectedIndex },
      renders: [0, 1, 2].map((index) => ({
        id: `appearance-1:${index}`,
        index,
        imageUrl: `img-${index}`,
        media: null,
        isSelected: selectedIndex === index,
        previousImageUrl: null,
        previousMedia: null,
        taskRefs: [],
        taskState: idleTaskState,
      })),
      taskRefs: [],
      taskState: idleTaskState,
    }],
    introduction: null,
    profileData: null,
    profileConfirmed: true,
    profileTaskRefs: [],
    profileTaskState: idleTaskState,
    voice: {
      voiceType: null,
      voiceId: null,
      customVoiceUrl: null,
      media: null,
    },
  }]
}

function buildUnifiedLocationAssets(selectedIndex: number | null): AssetSummary[] {
  const variants = [0, 1, 2].map((index) => ({
    id: `location-image-${index}`,
    index,
    label: `Image ${index + 1}`,
    description: null,
    selectionState: { selectedRenderIndex: selectedIndex === index ? 0 : null },
    renders: [{
      id: `location-image-${index}`,
      index: 0,
      imageUrl: `location-${index}`,
      media: null,
      isSelected: selectedIndex === index,
      previousImageUrl: null,
      previousMedia: null,
      taskRefs: [],
      taskState: idleTaskState,
    }],
    taskRefs: [],
    taskState: idleTaskState,
  }))

  return [{
    id: 'location-1',
    scope: 'project',
    kind: 'location',
    family: 'visual',
    name: 'Street',
    folderId: null,
    capabilities,
    taskRefs: [],
    taskState: idleTaskState,
    variants,
    summary: null,
    selectedVariantId: selectedIndex === null ? null : `location-image-${selectedIndex}`,
  }]
}

describe('project asset optimistic mutations', () => {
  beforeEach(() => {
    queryClient = new MockQueryClient()
    useQueryClientMock.mockClear()
    useMutationMock.mockClear()
  })

  it('optimistically selects project character image and ignores stale rollback', async () => {
    const projectId = 'project-1'
    const assetsKey = queryKeys.assets.list({ scope: 'project', projectId })
    const projectKey = queryKeys.projectData(projectId)
    queryClient.seedQuery(assetsKey, buildUnifiedCharacterAssets(0))
    queryClient.seedQuery(projectKey, buildProject(0))

    const mutation = useSelectProjectCharacterImage(projectId) as unknown as SelectProjectCharacterMutation
    const firstVariables = {
      characterId: 'character-1',
      appearanceId: 'appearance-1',
      imageIndex: 1,
    }
    const secondVariables = {
      characterId: 'character-1',
      appearanceId: 'appearance-1',
      imageIndex: 2,
    }

    const firstContext = await mutation.onMutate(firstVariables)
    const afterFirst = queryClient.getQueryData<AssetSummary[]>(assetsKey)
    const afterFirstCharacter = afterFirst?.find((asset) => asset.kind === 'character')
    expect(afterFirstCharacter?.variants[0]?.selectionState.selectedRenderIndex).toBe(1)
    expect(afterFirstCharacter?.variants[0]?.renders.map((render) => render.isSelected)).toEqual([false, true, false])

    const secondContext = await mutation.onMutate(secondVariables)
    const afterSecond = queryClient.getQueryData<AssetSummary[]>(assetsKey)
    const afterSecondCharacter = afterSecond?.find((asset) => asset.kind === 'character')
    expect(afterSecondCharacter?.variants[0]?.selectionState.selectedRenderIndex).toBe(2)

    mutation.onError(new Error('first failed'), firstVariables, firstContext)
    const afterStaleError = queryClient.getQueryData<AssetSummary[]>(assetsKey)
    const afterStaleCharacter = afterStaleError?.find((asset) => asset.kind === 'character')
    expect(afterStaleCharacter?.variants[0]?.selectionState.selectedRenderIndex).toBe(2)

    mutation.onError(new Error('second failed'), secondVariables, secondContext)
    const afterLatestRollback = queryClient.getQueryData<AssetSummary[]>(assetsKey)
    const afterRollbackCharacter = afterLatestRollback?.find((asset) => asset.kind === 'character')
    expect(afterRollbackCharacter?.variants[0]?.selectionState.selectedRenderIndex).toBe(1)
  })

  it('optimistically selects a project location image in the cache used by the asset library', async () => {
    const projectId = 'project-1'
    const assetsKey = queryKeys.assets.list({ scope: 'project', projectId })
    queryClient.seedQuery(assetsKey, buildUnifiedLocationAssets(0))

    const mutation = useSelectProjectLocationImage(projectId) as unknown as SelectProjectLocationMutation
    const variables = {
      locationId: 'location-1',
      imageIndex: 2,
    }

    const context = await mutation.onMutate(variables)
    const afterSelection = queryClient.getQueryData<AssetSummary[]>(assetsKey)
    const location = afterSelection?.find((asset) => asset.kind === 'location')
    expect(location?.selectedVariantId).toBe('location-image-2')
    expect(location?.variants.map((variant) => variant.renders[0]?.isSelected)).toEqual([false, false, true])

    mutation.onError(new Error('request failed'), variables, context)
    const afterRollback = queryClient.getQueryData<AssetSummary[]>(assetsKey)
    const rolledBackLocation = afterRollback?.find((asset) => asset.kind === 'location')
    expect(rolledBackLocation?.selectedVariantId).toBe('location-image-0')
    expect(rolledBackLocation?.variants.map((variant) => variant.renders[0]?.isSelected)).toEqual([true, false, false])
  })

  it('optimistically deletes project character and restores on error', async () => {
    const projectId = 'project-1'
    const assetsKey = queryKeys.projectAssets.all(projectId)
    const projectKey = queryKeys.projectData(projectId)
    queryClient.seedQuery(assetsKey, buildAssets(0))
    queryClient.seedQuery(projectKey, buildProject(0))

    const mutation = useDeleteProjectCharacter(projectId) as unknown as DeleteProjectCharacterMutation
    const context = await mutation.onMutate('character-1')

    const afterDeleteAssets = queryClient.getQueryData<ProjectAssetsData>(assetsKey)
    expect(afterDeleteAssets?.characters).toHaveLength(0)

    const afterDeleteProject = queryClient.getQueryData<Project>(projectKey)
    expect(afterDeleteProject?.novelPromotionData?.characters ?? []).toHaveLength(0)

    mutation.onError(new Error('delete failed'), 'character-1', context)

    const rolledBackAssets = queryClient.getQueryData<ProjectAssetsData>(assetsKey)
    expect(rolledBackAssets?.characters).toHaveLength(1)
    expect(rolledBackAssets?.characters[0]?.id).toBe('character-1')
  })
})
