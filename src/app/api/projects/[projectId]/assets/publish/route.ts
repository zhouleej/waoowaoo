import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuthLight } from '@/lib/api-auth'
import { publishProjectAsset, publishProjectAssets } from '@/lib/assets/services/publish-project-assets'
import type { AssetKind } from '@/lib/assets/contracts'

const KINDS = new Set<AssetKind>(['character', 'location', 'prop', 'voice'])

export const POST = apiHandler(async (request: NextRequest, context: { params: Promise<{ projectId: string }> }) => {
  const { projectId } = await context.params
  const auth = await requireProjectAuthLight(projectId)
  if (isErrorResponse(auth)) return auth
  const body = await request.json() as { assetId?: unknown; kind?: unknown }
  if (body.assetId === undefined && body.kind === undefined) {
    return NextResponse.json(await publishProjectAssets({ projectId, userId: auth.session.user.id }))
  }
  if (typeof body.assetId !== 'string' || !body.assetId || typeof body.kind !== 'string' || !KINDS.has(body.kind as AssetKind)) {
    throw new ApiError('INVALID_PARAMS')
  }
  return NextResponse.json(await publishProjectAsset({ projectId, userId: auth.session.user.id, assetId: body.assetId, kind: body.kind as AssetKind }))
})
