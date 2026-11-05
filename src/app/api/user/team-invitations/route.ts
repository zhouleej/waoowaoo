import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/api-errors'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

export const GET = apiHandler(async () => {
  const auth = await requireUserAuth()
  if (isErrorResponse(auth)) return auth
  const data = await prisma.organizationInvitation.findMany({
    where: { inviteeUserId: auth.session.user.id, status: 'pending', expiresAt: { gt: new Date() }, organization: { status: 'active' } },
    select: { id: true, role: true, expiresAt: true, organization: { select: { id: true, name: true } }, invitedBy: { select: { name: true, image: true } } },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json({ data })
})
