import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuthLight } from '@/lib/api-auth'
import { requireNovelPromotionEpisodeInProject } from '@/lib/saas/novel-promotion-resource-access'
import { listEpisodeSnapshots, restoreEpisodeSnapshot } from '@/lib/novel-promotion/episode-snapshots'

export const GET = apiHandler(async (request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) => {
  const { projectId } = await params
  const auth = await requireProjectAuthLight(projectId)
  if (isErrorResponse(auth)) return auth
  const episodeId = request.nextUrl.searchParams.get('episodeId')
  if (!episodeId) throw new ApiError('INVALID_PARAMS')
  await requireNovelPromotionEpisodeInProject(projectId, episodeId)
  return NextResponse.json({ snapshots: await listEpisodeSnapshots(projectId, episodeId) })
})

export const POST = apiHandler(async (request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) => {
  const { projectId } = await params
  const auth = await requireProjectAuthLight(projectId)
  if (isErrorResponse(auth)) return auth
  const { episodeId, snapshotId } = await request.json()
  if (typeof episodeId !== 'string' || typeof snapshotId !== 'string') throw new ApiError('INVALID_PARAMS')
  await requireNovelPromotionEpisodeInProject(projectId, episodeId)
  try { return NextResponse.json(await restoreEpisodeSnapshot(projectId, episodeId, snapshotId)) }
  catch (error) { throw new ApiError('CONFLICT', { message: error instanceof Error ? error.message : String(error) }) }
})
