import { NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { audit, lockTeam } from '@/lib/workspace/teams'
export const POST = apiHandler(async (req, ctx) => {
  const auth = await requireUserAuth()
  if (isErrorResponse(auth)) return auth
  const { id } = await ctx.params
  const organizationId = String(id), actorId = auth.session.user.id
  const { userId } = await req.json()
  if (typeof userId !== 'string' || actorId === userId) throw new ApiError('INVALID_PARAMS')
  await prisma.$transaction(async tx => {
    await lockTeam(tx, organizationId)
    const actor = await tx.organizationMember.findUnique({ where: { organizationId_userId: { organizationId, userId: actorId } }, include: { organization: true } })
    const target = await tx.organizationMember.findUnique({ where: { organizationId_userId: { organizationId, userId } } })
    if (!actor || actor.role !== 'owner' || actor.status !== 'active' || actor.organization.status !== 'active' || !target || target.status !== 'active') throw new ApiError('FORBIDDEN')
    await tx.organization.update({ where: { id: organizationId }, data: { ownerId: userId } })
    await tx.organizationMember.update({ where: { id: actor.id }, data: { role: 'admin' } })
    await tx.organizationMember.update({ where: { id: target.id }, data: { role: 'owner' } })
    await audit(tx, organizationId, actorId, 'transfer_owner', userId)
  })
  return NextResponse.json({ success: true })
})
