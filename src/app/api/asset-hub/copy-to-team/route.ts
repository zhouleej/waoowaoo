import { NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { copyPersonalAssets } from '@/lib/workspace/asset-copy'

export const POST = apiHandler(async request => {
  const auth = await requireUserAuth()
  if (isErrorResponse(auth)) return auth
  const body = await request.json()
  if (typeof body.organizationId !== 'string') throw new ApiError('INVALID_PARAMS')
  return NextResponse.json({ assets: await copyPersonalAssets(auth.session.user.id, body.organizationId, body.assets) }, { status: 201 })
})
