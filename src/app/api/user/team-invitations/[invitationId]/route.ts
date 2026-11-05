import { NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { respondToInvitation } from '@/lib/workspace/teams'
export const POST = apiHandler(async (req, ctx) => {
  const auth = await requireUserAuth()
  if (isErrorResponse(auth)) return auth
  const { invitationId } = await ctx.params
  const body = await req.json()
  if (!['accept', 'reject'].includes(body.action)) throw new ApiError('INVALID_PARAMS')
  return NextResponse.json(await respondToInvitation(String(invitationId), auth.session.user.id, body.action === 'accept'))
})
