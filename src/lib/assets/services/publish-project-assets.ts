import { prisma } from '@/lib/prisma'
import { ApiError } from '@/lib/api-errors'
import type { AssetKind } from '@/lib/assets/contracts'
import { encodeImageUrls } from '@/lib/contracts/image-urls-contract'

type PublishAccess = {
  userId: string
  projectId: string
}

export type PublishResult = {
  kind: AssetKind
  status: 'published' | 'already-published' | 'skipped'
  globalAssetId?: string
  reason?: 'NO_SELECTED_RENDER' | 'NO_VOICE'
}

export type PublishBatchResult = {
  results: PublishResult[]
  published: number
  alreadyPublished: number
  skipped: number
}

function selectedCharacterImage(appearance: {
  imageUrl: string | null
  imageUrls: string | null
  selectedIndex: number | null
}) {
  const candidates = (() => {
    try {
      const value: unknown = appearance.imageUrls ? JSON.parse(appearance.imageUrls) : []
      return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.length > 0) : []
    } catch {
      return []
    }
  })()
  return candidates[appearance.selectedIndex ?? 0] || appearance.imageUrl || candidates[0] || null
}

async function publishVoiceFromCharacter(character: {
  name: string
  voiceId: string | null
  voiceType: string | null
  customVoiceUrl: string | null
  customVoiceMediaId: string | null
}, access: PublishAccess): Promise<string | null> {
  if (!character.voiceId && !character.customVoiceUrl) return null
  const existing = await prisma.globalVoice.findFirst({
    where: {
      userId: access.userId,
      OR: [
        ...(character.voiceId ? [{ voiceId: character.voiceId }] : []),
        ...(character.customVoiceUrl ? [{ customVoiceUrl: character.customVoiceUrl }] : []),
      ],
    },
    select: { id: true },
  })
  if (existing) return existing.id
  const voice = await prisma.globalVoice.create({
    data: {
      userId: access.userId,
      name: `${character.name} 的音色`,
      voiceId: character.voiceId,
      voiceType: character.voiceType || (character.customVoiceUrl ? 'custom' : 'qwen-designed'),
      customVoiceUrl: character.customVoiceUrl,
      customVoiceMediaId: character.customVoiceMediaId,
    },
    select: { id: true },
  })
  return voice.id
}

export async function publishProjectAsset(input: PublishAccess & { assetId: string; kind: AssetKind }): Promise<PublishResult> {
  if (input.kind === 'voice') {
    const character = await prisma.novelPromotionCharacter.findFirst({
      where: { id: input.assetId, novelPromotionProject: { projectId: input.projectId } },
      select: { name: true, voiceId: true, voiceType: true, customVoiceUrl: true, customVoiceMediaId: true },
    })
    if (!character) throw new ApiError('NOT_FOUND')
    const globalAssetId = await publishVoiceFromCharacter(character, input)
    return globalAssetId
      ? { kind: 'voice', status: 'published', globalAssetId }
      : { kind: 'voice', status: 'skipped', reason: 'NO_VOICE' }
  }

  if (input.kind === 'character') {
    const character = await prisma.novelPromotionCharacter.findFirst({
      where: { id: input.assetId, novelPromotionProject: { projectId: input.projectId } },
      include: { appearances: { orderBy: { appearanceIndex: 'asc' } } },
    })
    if (!character) throw new ApiError('NOT_FOUND')
    if (character.sourceGlobalCharacterId) {
      const global = await prisma.globalCharacter.findFirst({ where: { id: character.sourceGlobalCharacterId, userId: input.userId }, select: { id: true } })
      if (global) return { kind: 'character', status: 'already-published', globalAssetId: global.id }
    }
    const appearances = character.appearances
      .map((appearance) => ({ appearance, imageUrl: selectedCharacterImage(appearance) }))
      .filter((item): item is { appearance: typeof character.appearances[number]; imageUrl: string } => !!item.imageUrl)
    if (appearances.length === 0) return { kind: 'character', status: 'skipped', reason: 'NO_SELECTED_RENDER' }
    const globalVoiceId = await publishVoiceFromCharacter(character, input)
    const global = await prisma.globalCharacter.create({
      data: {
        userId: input.userId,
        name: character.name,
        aliases: character.aliases,
        profileData: character.profileData,
        profileConfirmed: character.profileConfirmed,
        voiceId: character.voiceId,
        voiceType: character.voiceType,
        customVoiceUrl: character.customVoiceUrl,
        customVoiceMediaId: character.customVoiceMediaId,
        globalVoiceId,
        appearances: {
          create: appearances.map(({ appearance, imageUrl }) => ({
            appearanceIndex: appearance.appearanceIndex,
            changeReason: appearance.changeReason,
            description: appearance.description,
            descriptions: appearance.descriptions,
            imageUrl,
            imageMediaId: appearance.imageMediaId,
            imageUrls: encodeImageUrls([imageUrl]),
            previousImageUrls: encodeImageUrls([]),
            selectedIndex: 0,
          })),
        },
      },
      select: { id: true },
    })
    await prisma.novelPromotionCharacter.update({ where: { id: character.id }, data: { sourceGlobalCharacterId: global.id } })
    return { kind: 'character', status: 'published', globalAssetId: global.id }
  }

  const location = await prisma.novelPromotionLocation.findFirst({
    where: { id: input.assetId, novelPromotionProject: { projectId: input.projectId }, assetKind: input.kind },
    include: { images: { orderBy: { imageIndex: 'asc' } } },
  })
  if (!location) throw new ApiError('NOT_FOUND')
  if (location.sourceGlobalLocationId) {
    const global = await prisma.globalLocation.findFirst({ where: { id: location.sourceGlobalLocationId, userId: input.userId }, select: { id: true } })
    if (global) return { kind: input.kind, status: 'already-published', globalAssetId: global.id }
  }
  const image = location.images.find((item) => item.isSelected && item.imageUrl) || location.images.find((item) => item.imageUrl)
  if (!image?.imageUrl) return { kind: input.kind, status: 'skipped', reason: 'NO_SELECTED_RENDER' }
  const global = await prisma.globalLocation.create({
    data: {
      userId: input.userId,
      name: location.name,
      summary: location.summary,
      assetKind: input.kind,
      images: { create: [{ imageIndex: 0, description: image.description, availableSlots: image.availableSlots, imageUrl: image.imageUrl, imageMediaId: image.imageMediaId, isSelected: true }] },
    },
    select: { id: true },
  })
  await prisma.novelPromotionLocation.update({ where: { id: location.id }, data: { sourceGlobalLocationId: global.id } })
  return { kind: input.kind, status: 'published', globalAssetId: global.id }
}

export async function publishProjectAssets(input: PublishAccess): Promise<PublishBatchResult> {
  const project = await prisma.novelPromotionProject.findUnique({
    where: { projectId: input.projectId },
    select: { id: true, characters: { select: { id: true } }, locations: { select: { id: true, assetKind: true } } },
  })
  if (!project) throw new ApiError('NOT_FOUND')
  const targets = [
    ...project.characters.flatMap((character) => ([{ assetId: character.id, kind: 'character' as const }, { assetId: character.id, kind: 'voice' as const }])),
    ...project.locations
      .filter((location) => location.assetKind === 'location' || location.assetKind === 'prop')
      .map((location) => ({ assetId: location.id, kind: location.assetKind as 'location' | 'prop' })),
  ]
  const results: PublishResult[] = []
  for (const target of targets) results.push(await publishProjectAsset({ ...input, ...target }))
  return {
    results,
    published: results.filter((result) => result.status === 'published').length,
    alreadyPublished: results.filter((result) => result.status === 'already-published').length,
    skipped: results.filter((result) => result.status === 'skipped').length,
  }
}
