import { prisma } from '@/lib/prisma'
import { getAuthSession } from '@/lib/api-auth'
import { WorkspaceError as ApiError } from './errors'
import { workspaceRuntime, workspaceScopeKey } from './runtime'

export async function registerMediaScope(mediaId: string) {
  const runtime = workspaceRuntime()
  if (!runtime.actorId) return
  const scopeKey = workspaceScopeKey(runtime.actorId)
  const existing = await prisma.mediaScopeGrant.findMany({ where: { mediaId }, select: { scopeKey: true } })
  if (existing.length && !existing.some(grant => grant.scopeKey === scopeKey)) throw new ApiError('FORBIDDEN', { message: 'Media belongs to another workspace' })
  await prisma.mediaScopeGrant.upsert({ where: { mediaId_scopeKey: { mediaId, scopeKey } }, create: { mediaId, scopeKey }, update: {} })
}

export async function assertMediaReadAccess(input: { mediaId?: string; storageKey?: string }) {
  const media = input.mediaId ? { id: input.mediaId } : await prisma.mediaObject.findUnique({ where: { storageKey: input.storageKey! }, select: { id: true } })
  if (!media) return // Legacy system media has no workspace grant.
  const grants = await prisma.mediaScopeGrant.findMany({ where: { mediaId: media.id }, select: { scopeKey: true } })
  if (!grants.length) return
  const session = await getAuthSession()
  if (!session?.user?.id) throw new ApiError('UNAUTHORIZED')
  const userId = session.user.id
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { isGlobalLocked: true } })
  if (user?.isGlobalLocked) throw new ApiError('FORBIDDEN')
  if (grants.some(grant => grant.scopeKey === `personal:${userId}`)) return
  const organizations = grants.filter(grant => grant.scopeKey.startsWith('team:')).map(grant => grant.scopeKey.slice(5))
  const member = await prisma.organizationMember.findFirst({ where: { userId, organizationId: { in: organizations }, status: 'active', organization: { status: 'active' } }, select: { id: true } })
  if (!member) throw new ApiError('FORBIDDEN')
}
