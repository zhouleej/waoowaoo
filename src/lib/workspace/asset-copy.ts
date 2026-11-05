import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { WorkspaceError as ApiError } from './errors'
import { customArtStyleId, customArtStyleValue } from '@/lib/art-styles/custom'
import { extractStorageKey } from '@/lib/storage'
import { audit, lockTeam } from './teams'

function copyFields<T extends Record<string, unknown>>(record: T, ...excluded: string[]) {
  return Object.fromEntries(Object.entries(record).filter(([key]) => !['id', 'createdAt', 'updatedAt', 'revision', ...excluded].includes(key)))
}

async function grantCopiedMedia(tx: Prisma.TransactionClient, record: unknown, organizationId: string, userId: string) {
  if (!record || typeof record !== 'object') return
  for (const [key, value] of Object.entries(record)) {
    if (typeof value === 'string' && (/MediaId$/.test(key) || /Urls?$/.test(key))) {
      let values = [value]
      if (key.endsWith('Urls')) { try { values = JSON.parse(value) } catch { values = [] } }
      for (const candidate of values) {
        if (typeof candidate !== 'string') continue
        const publicId = candidate.match(/\/m\/([^/?]+)/)?.[1]
        const storageKey = extractStorageKey(candidate)
        const media = /MediaId$/.test(key) ? await tx.mediaObject.findUnique({ where: { id: candidate } })
          : publicId ? await tx.mediaObject.findUnique({ where: { publicId } })
          : storageKey ? await tx.mediaObject.findUnique({ where: { storageKey } }) : null
        if (media) {
          await tx.mediaScopeGrant.upsert({ where: { mediaId_scopeKey: { mediaId: media.id, scopeKey: `personal:${userId}` } }, create: { mediaId: media.id, scopeKey: `personal:${userId}` }, update: {} })
          await tx.mediaScopeGrant.upsert({ where: { mediaId_scopeKey: { mediaId: media.id, scopeKey: `team:${organizationId}` } }, create: { mediaId: media.id, scopeKey: `team:${organizationId}` }, update: {} })
        }
      }
    } else if (value && typeof value === 'object') await grantCopiedMedia(tx, value, organizationId, userId)
  }
}

export async function copyPersonalAssets(userId: string, organizationId: string, assets: Array<{ id: string; kind: string }>) {
  if (!Array.isArray(assets) || !assets.length || assets.length > 50) throw new ApiError('INVALID_PARAMS')
  return prisma.$transaction(async tx => {
    await lockTeam(tx, organizationId)
    const membership = await tx.organizationMember.findUnique({ where: { organizationId_userId: { organizationId, userId } }, include: { organization: true } })
    if (!membership || membership.status !== 'active' || membership.organization.status !== 'active') throw new ApiError('FORBIDDEN')
    const result: Array<{ id: string; kind: string }> = []
    const copiedStyles = new Map<string, string>()
    async function copyStyle(value: unknown) {
      const styleId = customArtStyleId(value)
      if (!styleId) return value
      if (copiedStyles.has(styleId)) return copiedStyles.get(styleId)!
      const style = await tx.customArtStyle.findFirst({ where: { id: styleId, userId, organizationId: null } })
      if (!style) throw new ApiError('FORBIDDEN')
      const created = await tx.customArtStyle.create({ data: { name: style.name, prompt: style.prompt, userId, organizationId } })
      const selected = customArtStyleValue(created.id)
      copiedStyles.set(styleId, selected)
      return selected
    }
    for (const asset of assets) {
      let id: string = randomUUID()
      if (asset.kind === 'character') {
        const source = await tx.globalCharacter.findFirst({ where: { id: asset.id, userId, organizationId: null }, include: { appearances: true } })
        if (!source) throw new ApiError('NOT_FOUND')
        await grantCopiedMedia(tx, source, organizationId, userId)
        const data = { ...copyFields(source, 'userId', 'organizationId', 'folderId', 'appearances'), id, userId, organizationId, folderId: null, globalVoiceId: null, voiceId: null, voiceType: source.customVoiceUrl ? 'custom' : null, appearances: { create: await Promise.all(source.appearances.map(async appearance => ({ ...copyFields(appearance, 'characterId'), id: randomUUID(), artStyle: await copyStyle(appearance.artStyle) }))) } }
        await tx.globalCharacter.create({ data: data as Prisma.GlobalCharacterUncheckedCreateInput })
      } else if (asset.kind === 'location' || asset.kind === 'prop') {
        const source = await tx.globalLocation.findFirst({ where: { id: asset.id, userId, organizationId: null }, include: { images: true } })
        if (!source) throw new ApiError('NOT_FOUND')
        await grantCopiedMedia(tx, source, organizationId, userId)
        const data = { ...copyFields(source, 'userId', 'organizationId', 'folderId', 'images'), id, userId, organizationId, folderId: null, artStyle: await copyStyle(source.artStyle), images: { create: source.images.map(image => ({ ...copyFields(image, 'locationId'), id: randomUUID() })) } }
        await tx.globalLocation.create({ data: data as Prisma.GlobalLocationUncheckedCreateInput })
      } else if (asset.kind === 'voice') {
        const source = await tx.globalVoice.findFirst({ where: { id: asset.id, userId, organizationId: null } })
        if (!source) throw new ApiError('NOT_FOUND')
        if (source.voiceId || !source.customVoiceUrl) throw new ApiError('INVALID_PARAMS', { message: '请在团队账号下重新创建该服务商音色 / Recreate this provider voice in the team' })
        await grantCopiedMedia(tx, source, organizationId, userId)
        await tx.globalVoice.create({ data: { ...copyFields(source, 'userId', 'organizationId', 'folderId'), id, userId, organizationId, folderId: null } as Prisma.GlobalVoiceUncheckedCreateInput })
      } else if (asset.kind === 'style') {
        id = customArtStyleId(await copyStyle(customArtStyleValue(asset.id)))!
      } else throw new ApiError('INVALID_PARAMS')
      result.push({ id, kind: asset.kind })
    }
    await audit(tx, organizationId, userId, 'copy_personal_assets', organizationId, { count: result.length })
    return result
  }, { timeout: 30000 })
}
