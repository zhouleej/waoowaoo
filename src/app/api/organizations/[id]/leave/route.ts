import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/api-errors'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { updateTeamMember } from '@/lib/workspace/teams'
export const POST = apiHandler(async (_req, ctx) => {
  const auth = await requireUserAuth()
  if (isErrorResponse(auth)) return auth
  const { id } = await ctx.params
  await updateTeamMember(String(id), auth.session.user.id, auth.session.user.id, {}, true)
  return NextResponse.json({ success: true })
})
