import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { WorkspaceError as ApiError } from './errors'
import { releaseTeamReservation } from './budget'

export async function teamMember(organizationId: string, userId: string, roles = ['owner', 'admin', 'member']) {
  const member = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId } }, include: { organization: true, user: { select: { isGlobalLocked: true } } },
  })
  if (!member || member.status !== 'active' || member.organization.status !== 'active' || member.user?.isGlobalLocked || !roles.includes(member.role)) {
    throw new ApiError('FORBIDDEN')
  }
  return member
}

export function audit(tx: Prisma.TransactionClient, organizationId: string, actorId: string, action: string, targetId?: string, details?: Prisma.InputJsonValue) {
  return tx.enterpriseAuditLog.create({ data: { organizationId, actorId, action, targetType: 'Team', targetId, details } })
}

export async function lockTeam(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${id} FOR UPDATE`
}

export async function inviteAccount(organizationId: string, actorId: string, account: string, role: string) {
  if (!account.trim() || !['admin', 'member'].includes(role)) throw new ApiError('INVALID_PARAMS')
  return prisma.$transaction(async (tx) => {
    await lockTeam(tx, organizationId)
    const sender = await tx.organizationMember.findUnique({ where: { organizationId_userId: { organizationId, userId: actorId } }, include: { organization: true } })
    if (!sender || sender.status !== 'active' || sender.organization.status !== 'active' || !['owner', 'admin'].includes(sender.role)
      || (role === 'admin' && sender.role !== 'owner')) throw new ApiError('FORBIDDEN')
    const user = await tx.user.findUnique({ where: { name: account.trim() }, select: { id: true, name: true, image: true, isGlobalLocked: true } })
    if (!user || user.isGlobalLocked) throw new ApiError('INVALID_PARAMS', { message: '请对方先注册 / Ask the member to register first' })
    if (await tx.organizationMember.findUnique({ where: { organizationId_userId: { organizationId, userId: user.id } } })) {
      throw new ApiError('CONFLICT', { message: '该账号已在团队中 / Already a team member' })
    }
    const activeInviteKey = `${organizationId}:${user.id}`
    const existing = await tx.organizationInvitation.findUnique({ where: { activeInviteKey } })
    if (existing && existing.status === 'pending' && existing.expiresAt && existing.expiresAt > new Date()) return { ...existing, invitee: user }
    if (existing) await tx.organizationInvitation.update({ where: { id: existing.id }, data: { status: 'expired', activeInviteKey: null } })
    const invitation = await tx.organizationInvitation.create({ data: {
      organizationId, invitedById: actorId, inviteeUserId: user.id, activeInviteKey, role,
      expiresAt: new Date(Date.now() + 7 * 86400000),
    } })
    await audit(tx, organizationId, actorId, 'invite_member', invitation.id, { userId: user.id, role })
    return { ...invitation, invitee: user }
  })
}

export async function respondToInvitation(invitationId: string, userId: string, accept: boolean) {
  const found = await prisma.organizationInvitation.findUnique({ where: { id: invitationId } })
  if (!found || found.inviteeUserId !== userId) throw new ApiError('NOT_FOUND')
  return prisma.$transaction(async (tx) => {
    await lockTeam(tx, found.organizationId)
    const invitation = await tx.organizationInvitation.findUniqueOrThrow({ where: { id: invitationId } })
    if (invitation.status === 'accepted' && accept) return { organizationId: invitation.organizationId, status: 'accepted' }
    if (invitation.status !== 'pending' || !invitation.expiresAt || invitation.expiresAt <= new Date()) throw new ApiError('CONFLICT', { message: '邀请已失效 / Invitation no longer valid' })
    const sender = await tx.organizationMember.findUnique({ where: { organizationId_userId: { organizationId: invitation.organizationId, userId: invitation.invitedById } }, include: { organization: { include: { currentPlan: { include: { entitlements: true } } } } } })
    if (!sender || sender.status !== 'active' || sender.organization.status !== 'active' || !['owner', 'admin'].includes(sender.role)
      || (invitation.role === 'admin' && sender.role !== 'owner')) throw new ApiError('CONFLICT', { message: '邀请人权限已变化 / Inviter permissions changed' })
    if (accept) {
      const existing = await tx.organizationMember.findUnique({ where: { organizationId_userId: { organizationId: invitation.organizationId, userId } } })
      if (existing && existing.status !== 'active') throw new ApiError('FORBIDDEN')
      const entitlement = sender.organization.currentPlan?.entitlements.find(item => item.key === 'memberLimit')
      const limit = typeof entitlement?.value === 'number' ? entitlement.value : 0
      if (!existing && limit > 0 && await tx.organizationMember.count({ where: { organizationId: invitation.organizationId } }) >= limit) throw new ApiError('QUOTA_EXCEEDED')
      if (!existing) await tx.organizationMember.create({ data: { organizationId: invitation.organizationId, userId, role: invitation.role } })
    }
    const status = accept ? 'accepted' : 'rejected'
    await tx.organizationInvitation.update({ where: { id: invitation.id }, data: { status, activeInviteKey: null, ...(accept ? { acceptedAt: new Date() } : { rejectedAt: new Date() }) } })
    await audit(tx, invitation.organizationId, userId, `${status}_invitation`, invitation.id)
    return { organizationId: invitation.organizationId, status }
  })
}

export async function stopMemberTasks(organizationId: string, userId: string) {
  const { cancelTask } = await import('@/lib/task/service')
  const { removeTaskJob } = await import('@/lib/task/queues')
  const tasks = await prisma.task.findMany({ where: { organizationId, userId, status: 'queued', externalId: null }, select: { id: true } })
  for (const task of tasks) {
    await cancelTask(task.id, 'Team membership changed')
    await releaseTeamReservation(task.id)
    await removeTaskJob(task.id).catch(() => false)
  }
  await prisma.organizationInvitation.updateMany({ where: { organizationId, invitedById: userId, status: 'pending' }, data: { status: 'revoked', revokedAt: new Date(), activeInviteKey: null } })
}

export async function updateTeamMember(organizationId: string, actorId: string, userId: string, patch: { role?: unknown; quota?: unknown; status?: unknown }, remove = false) {
  await prisma.$transaction(async tx => {
    await lockTeam(tx, organizationId)
    const actor = await tx.organizationMember.findUnique({ where: { organizationId_userId: { organizationId, userId: actorId } }, include: { organization: true } })
    const target = await tx.organizationMember.findUnique({ where: { organizationId_userId: { organizationId, userId } } })
    if (!actor || actor.status !== 'active' || actor.organization.status !== 'active' || !target) throw new ApiError('FORBIDDEN')
    const self = actorId === userId
    if (self && !remove) throw new ApiError('INVALID_PARAMS', { message: 'Cannot change your own membership' })
    if (target.role === 'owner') throw new ApiError('FORBIDDEN', { message: 'Transfer ownership first' })
    if (!self && actor.role !== 'owner' && !(actor.role === 'admin' && target.role === 'member' && patch.role !== 'admin')) throw new ApiError('FORBIDDEN')
    if (patch.role !== undefined && !['admin', 'member'].includes(String(patch.role))) throw new ApiError('INVALID_PARAMS')
    if (patch.status !== undefined && !['active', 'frozen'].includes(String(patch.status))) throw new ApiError('INVALID_PARAMS')
    if (patch.quota !== undefined && (typeof patch.quota !== 'number' || !Number.isFinite(patch.quota) || patch.quota < 0 || patch.quota > 1e10)) throw new ApiError('INVALID_PARAMS')
    if (remove) await tx.organizationMember.delete({ where: { id: target.id } })
    else await tx.organizationMember.update({ where: { id: target.id }, data: {
      ...(patch.role !== undefined ? { role: String(patch.role) } : {}),
      ...(patch.status !== undefined ? { status: String(patch.status) } : {}),
      ...(typeof patch.quota === 'number' ? { quota: patch.quota } : {}),
    } })
    await audit(tx, organizationId, actorId, remove ? 'remove_member' : 'update_member', target.id, { userId, before: { role: target.role, status: target.status, quota: Number(target.quota) }, after: remove ? null : { role: String(patch.role ?? target.role), status: String(patch.status ?? target.status), quota: typeof patch.quota === 'number' ? patch.quota : Number(target.quota) } })
  })
  if (remove || patch.status === 'frozen') await stopMemberTasks(organizationId, userId)
}
