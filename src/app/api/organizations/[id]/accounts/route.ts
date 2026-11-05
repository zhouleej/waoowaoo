import { NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { teamMember } from '@/lib/workspace/teams'
export const GET = apiHandler(async (req, ctx) => {
  const auth = await requireUserAuth()
  if (isErrorResponse(auth)) return auth
  const { id } = await ctx.params
  await teamMember(String(id), auth.session.user.id, ['owner', 'admin'])
  const account = req.nextUrl.searchParams.get('account')?.trim()
  if (!account) throw new ApiError('INVALID_PARAMS')
  const user = await prisma.user.findUnique({ where: { name: account }, select: { id: true, name: true, image: true, isGlobalLocked: true } })
  return NextResponse.json({ user: user && !user.isGlobalLocked ? { id: user.id, name: user.name, image: user.image } : null })
})
