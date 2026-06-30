/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { badRequest, isErrorResponse, requireUserAuth } from '@/lib/api-auth'
import { apiHandler } from '@/lib/api-errors'
import { requireOrganizationRole, writeEnterpriseAudit } from '@/lib/saas/permissions'
import { readString } from '@/lib/saas/validation'

export const GET = apiHandler<{ id: string }>(async (_req, { params }) => {
  const auth = await requireUserAuth()
  if (isErrorResponse(auth)) return auth
  const { id } = await params
  const perm = await requireOrganizationRole(id, auth.session.user.id, ['owner', 'admin'])
  if (perm.error) return perm.error
  const data = await prisma.organizationInvitation.findMany({ where: { organizationId: id }, orderBy: { createdAt: 'desc' }, include: { invitedBy: { select: { id: true, name: true, email: true } } } })
  return NextResponse.json({ data })
})

export const POST = apiHandler<{ id: string }>(async (req, { params }) => {
  const auth = await requireUserAuth()
  if (isErrorResponse(auth)) return auth
  const { id } = await params
  const perm = await requireOrganizationRole(id, auth.session.user.id, ['owner', 'admin'])
  if (perm.error) return perm.error
  let body: any
  try { body = await req.json() } catch { return badRequest('请求体必须是JSON') }
  try {
    const email = readString(body.email, '邮箱', { required: true, max: 160 })!.toLowerCase()
    const role = readString(body.role ?? 'member', '角色', { max: 16 })!
    if (!['admin', 'member'].includes(role)) return badRequest('角色只能为 admin 或 member')
    if (perm.membership?.role === 'admin' && role === 'admin') return badRequest('管理员只能邀请普通成员')
    const invitee = await prisma.user.findFirst({ where: { email } })
    if (invitee) {
      const existed = await prisma.organizationMember.findUnique({ where: { organizationId_userId: { organizationId: id, userId: invitee.id } } })
      if (existed) return badRequest('该用户已经是企业成员')
    }
    const invitation = await prisma.organizationInvitation.create({
      data: {
        organizationId: id,
        email,
        role,
        invitedById: auth.session.user.id,
        tokenHash: crypto.createHash('sha256').update(`${id}:${email}:${Date.now()}:${Math.random()}`).digest('hex'),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    })
    await writeEnterpriseAudit({ organizationId: id, actorId: auth.session.user.id, action: 'invite_member', targetType: 'OrganizationInvitation', targetId: invitation.id, details: { email, role } })
    return NextResponse.json({ data: invitation }, { status: 201 })
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : '邀请参数无效')
  }
})
