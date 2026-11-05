import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/api-errors'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { getTeamModelConfig, saveTeamModelConfig } from '@/lib/workspace/model-config'
export const GET = apiHandler(async (_req, ctx) => {
  const auth = await requireUserAuth()
  if (isErrorResponse(auth)) return auth
  const { id } = await ctx.params
  return NextResponse.json(await getTeamModelConfig(String(id), auth.session.user.id))
})
export const PUT = apiHandler(async (req, ctx) => {
  const auth = await requireUserAuth()
  if (isErrorResponse(auth)) return auth
  const { id } = await ctx.params
  return NextResponse.json(await saveTeamModelConfig(String(id), auth.session.user.id, await req.json()))
})
