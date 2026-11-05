import type { PrismaClient } from '@prisma/client'
import { NextRequest } from 'next/server'
import { WorkspaceError as ApiError } from './errors'
import { withWorkspaceRuntime, workspaceRuntime } from './runtime'

const guarded = new Set(['Project', 'NovelPromotionProject', 'NovelPromotionEpisode', 'NovelPromotionClip', 'NovelPromotionCharacter', 'NovelPromotionLocation', 'NovelPromotionPanel', 'NovelPromotionShot', 'NovelPromotionStoryboard', 'NovelPromotionVoiceLine', 'CharacterAppearance', 'LocationImage', 'VideoEditorProject', 'GlobalAssetFolder', 'GlobalCharacter', 'GlobalLocation', 'GlobalVoice', 'CustomArtStyle', 'GlobalCharacterAppearance', 'GlobalLocationImage'])
type Row = Record<string, unknown>
type Delegate = { findUnique: (args: unknown) => Promise<Row | null> }

async function resourceOwner(base: PrismaClient, model: string, row: Row): Promise<{ organizationId: string | null; userId: string | null } | null> {
  if (model === 'Project' || model.startsWith('Global') && !['GlobalCharacterAppearance', 'GlobalLocationImage'].includes(model) || model === 'CustomArtStyle') {
    return { organizationId: row.organizationId as string | null, userId: row.userId as string | null }
  }
  const parent: Record<string, [string, string]> = {
    GlobalCharacterAppearance: ['GlobalCharacter', 'characterId'], GlobalLocationImage: ['GlobalLocation', 'locationId'],
    CharacterAppearance: ['NovelPromotionCharacter', 'characterId'], LocationImage: ['NovelPromotionLocation', 'locationId'],
    NovelPromotionCharacter: ['NovelPromotionProject', 'novelPromotionProjectId'], NovelPromotionLocation: ['NovelPromotionProject', 'novelPromotionProjectId'],
    NovelPromotionEpisode: ['NovelPromotionProject', 'novelPromotionProjectId'], NovelPromotionProject: ['Project', 'projectId'],
    NovelPromotionClip: ['NovelPromotionEpisode', 'episodeId'], NovelPromotionStoryboard: ['NovelPromotionEpisode', 'episodeId'],
    NovelPromotionPanel: ['NovelPromotionStoryboard', 'storyboardId'], NovelPromotionShot: ['NovelPromotionEpisode', 'episodeId'],
    NovelPromotionVoiceLine: ['NovelPromotionEpisode', 'episodeId'], VideoEditorProject: ['NovelPromotionEpisode', 'episodeId'],
  }
  const link = parent[model]
  if (!link || typeof row[link[1]] !== 'string') return null
  const delegate = (base as unknown as Record<string, Delegate>)[link[0][0].toLowerCase() + link[0].slice(1)]
  const next = await delegate.findUnique({ where: { id: row[link[1]] } })
  return next ? resourceOwner(base, link[0], next) : null
}

export function collectRevisions(value: unknown, target: Record<string, number>) {
  if (!value || typeof value !== 'object') return
  if (Array.isArray(value)) { for (const item of value) collectRevisions(item, target); return }
  const row = value as Row
  if (typeof row.id === 'string' && typeof row.revision === 'number') target[row.id] = row.revision
  for (const child of Object.values(row)) if (child && typeof child === 'object') collectRevisions(child, target)
}

export function parseRevisionHeader(value: string | null): Record<string, number> {
  if (!value) return {}
  if (value.length > 14000) throw new ApiError('INVALID_PARAMS')
  let parsed: unknown
  try { parsed = JSON.parse(value) } catch { throw new ApiError('INVALID_PARAMS') }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new ApiError('INVALID_PARAMS')
  const result: Record<string, number> = Object.create(null)
  for (const [id, revision] of Object.entries(parsed)) {
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id) || !Number.isSafeInteger(revision) || Number(revision) < 0) throw new ApiError('INVALID_PARAMS')
    result[id] = Number(revision)
  }
  return result
}

export async function withWorkspaceRequest(req: NextRequest, run: () => Promise<Response>) {
  return withWorkspaceRuntime({
    hint: req.headers.get('X-Workspace-Scope') ?? req.nextUrl.searchParams.get('workspaceScope'),
    expectedRevisions: parseRevisionHeader(req.headers.get('X-Resource-Revisions')), readRevisions: {}, createdIds: new Set(),
  }, async () => {
    const response = await run()
    const revisions = workspaceRuntime().readRevisions!
    const entries = Object.entries(revisions).slice(-220)
    if (entries.length) response.headers.set('X-Resource-Revisions', JSON.stringify(Object.fromEntries(entries)))
    return response
  })
}

export function revisionClient(base: PrismaClient): PrismaClient {
  return base.$extends({ query: { $allModels: { async $allOperations({ model, operation, args, query }) {
    const runtime = workspaceRuntime()
    const options = args as unknown as { where?: Row; data?: Row; update?: Row; select?: Row }
    const mutable = guarded.has(model)
    const write = ['update', 'updateMany', 'upsert'].includes(operation)
    const data = operation === 'upsert' ? options.update : options.data
    let id: string | undefined
    let expected: number | undefined
    const substantive = data && Object.keys(data).some(key => !['revision', 'updatedAt', 'lastAccessedAt'].includes(key))
    const uniqueWhere = options.where && (typeof options.where.id === 'string' ||
      model === 'NovelPromotionProject' && typeof options.where.projectId === 'string' ||
      model === 'VideoEditorProject' && typeof options.where.episodeId === 'string' ||
      'characterId_appearanceIndex' in options.where || 'locationId_imageIndex' in options.where || 'storyboardId_panelIndex' in options.where)
    if (mutable && runtime.actorId && write && substantive && options.where && uniqueWhere) {
      const delegate = (base as unknown as Record<string, Delegate>)[model[0].toLowerCase() + model.slice(1)]
      const row = await delegate.findUnique({ where: options.where })
      if (row && typeof row.id === 'string') {
        const owner = await resourceOwner(base, model, row)
        if (owner && (runtime.organizationId ? owner.organizationId !== runtime.organizationId : Boolean(owner.organizationId) || owner.userId !== runtime.actorId)) throw new ApiError('FORBIDDEN')
        if (!runtime.organizationId) return query(args)
        id = row.id
        expected = runtime.expectedRevisions?.[id]
        if (runtime.createdIds?.has(id)) expected = typeof row.revision === 'number' ? row.revision : 0
        if (expected === undefined) {
          if (runtime.taskId) await base.task.update({ where: { id: runtime.taskId }, data: { result: { candidate: JSON.parse(JSON.stringify({ model, id, data })), reason: 'revision_conflict' } } })
          throw new ApiError('CONFLICT', { message: '内容已变化，请保留草稿并加载最新版本 / Content changed; keep your draft and reload', resourceId: id })
        }
        options.where.revision = expected
        data!.revision = { increment: 1 }
      }
    }
    if (mutable && ['findUnique', 'findUniqueOrThrow', 'findFirst', 'findFirstOrThrow', 'findMany'].includes(operation) && options.select) {
      options.select.id = true; options.select.revision = true
    }
    try {
      const result = await query(args)
      if (id && expected !== undefined) {
        if (operation === 'updateMany' && (result as { count: number }).count !== 1) throw new ApiError('CONFLICT')
        runtime.expectedRevisions![id] = expected + 1
      }
      if (runtime.readRevisions) collectRevisions(result, runtime.readRevisions)
      if (operation === 'create' && result && typeof result === 'object' && 'id' in result && typeof result.id === 'string') runtime.createdIds?.add(result.id)
      return result
    } catch (error) {
      if (id && error && typeof error === 'object' && 'code' in error && ['P2025', 'P2002', 'CONFLICT'].includes(String(error.code))) {
        if (runtime.taskId) await base.task.update({ where: { id: runtime.taskId }, data: { result: { candidate: JSON.parse(JSON.stringify({ model, id, data })), reason: 'revision_conflict' } } })
        throw new ApiError('CONFLICT', { message: '内容已被其他成员更新，草稿未覆盖 / Another member updated this content; your draft was not saved', resourceId: id })
      }
      throw error
    }
  } } } }) as unknown as PrismaClient
}

export async function captureTargetRevisions(prisma: PrismaClient, targetType: string, targetId: string, projectId: string) {
  const models: Record<string, [string, Row | undefined]> = {
    GlobalCharacterAppearance: ['globalCharacterAppearance', undefined], GlobalLocationImage: ['globalLocationImage', undefined], LocationImage: ['locationImage', undefined],
    GlobalCharacter: ['globalCharacter', { appearances: true }], GlobalLocation: ['globalLocation', { images: true }], GlobalVoice: ['globalVoice', undefined],
    CharacterAppearance: ['characterAppearance', undefined], NovelPromotionPanel: ['novelPromotionPanel', undefined], NovelPromotionVoiceLine: ['novelPromotionVoiceLine', undefined],
    NovelPromotionLocation: ['novelPromotionLocation', { images: true }], NovelPromotionCharacter: ['novelPromotionCharacter', { appearances: true }],
    NovelPromotionStoryboard: ['novelPromotionStoryboard', { panels: true }], VideoEditorProject: ['videoEditorProject', undefined],
  }
  const revisions: Record<string, number> = {}
  const selected = models[targetType]
  if (selected) {
    const delegate = (prisma as unknown as Record<string, Delegate>)[selected[0]]
    collectRevisions(await delegate.findUnique({ where: { id: targetId }, ...(selected[1] ? { include: selected[1] } : {}) }), revisions)
  } else if (targetType.startsWith('NovelPromotion')) {
    collectRevisions(await prisma.novelPromotionProject.findUnique({ where: { projectId }, include: { characters: { include: { appearances: true } }, locations: { include: { images: true } }, episodes: { include: { clips: true, storyboards: { include: { panels: true } }, voiceLines: true } } } }), revisions)
  }
  return revisions
}
