/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { badRequest, isErrorResponse, notFound, requireUserAuth } from '@/lib/api-auth'
import { apiHandler } from '@/lib/api-errors'
import { requireOrganizationRole, writeEnterpriseAudit } from '@/lib/saas/permissions'

export const PATCH = apiHandler<{ id: string; invitationId: string }>(async (req, { params }) => {
  const auth = await requireUserAuth()
  if (isErrorResponse(auth)) return auth
  const { id, invitationId } = await params
  const perm = await requireOrganizationRole(id, auth.session.user.id, ['owner', 'admin'])
  if (perm.error) return perm.error
  let body: any
  try { body = await req.json() } catch { return badRequest('请求体必须是JSON') }
  if (body.status !== 'revoked') return badRequest('仅支持撤销邀请')
  const invitation = await prisma.organizationInvitation.findUnique({ where: { id: invitationId } })
  if (!invitation || invitation.organizationId !== id) return notFound('OrganizationInvitation')
  const updated = await prisma.organizationInvitation.update({ where: { id: invitationId }, data: { status: 'revoked', revokedAt: new Date() } })
  await writeEnterpriseAudit({ organizationId: id, actorId: auth.session.user.id, action: 'revoke_invitation', targetType: 'OrganizationInvitation', targetId: invitationId, details: { email: invitation.email } })
  return NextResponse.json({ data: updated })
})

export const DELETE = apiHandler<{ id: string; invitationId: string }>(async (_req, { params }) => {
  const auth = await requireUserAuth()
  if (isErrorResponse(auth)) return auth
  const { id, invitationId } = await params
  const perm = await requireOrganizationRole(id, auth.session.user.id, ['owner', 'admin'])
  if (perm.error) return perm.error
  const invitation = await prisma.organizationInvitation.findUnique({ where: { id: invitationId } })
  if (!invitation || invitation.organizationId !== id) return notFound('OrganizationInvitation')
  await prisma.organizationInvitation.update({ where: { id: invitationId }, data: { status: 'revoked', revokedAt: new Date() } })
  await writeEnterpriseAudit({ organizationId: id, actorId: auth.session.user.id, action: 'revoke_invitation', targetType: 'OrganizationInvitation', targetId: invitationId })
  return NextResponse.json({ success: true })
})
