import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

interface BatchEpisode {
  name: string
  description?: string | null
  novelText: string
}

function isEpisode(value: unknown): value is BatchEpisode {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return typeof row.name === 'string' && row.name.trim().length > 0 && row.name.length <= 191
    && typeof row.novelText === 'string'
    && (row.description == null || typeof row.description === 'string')
}

export const POST = apiHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await params
  const auth = await requireProjectAuthLight(projectId)
  if (isErrorResponse(auth)) return auth
  const { episodes, clearExisting = false, importStatus } = await request.json()
  if (!Array.isArray(episodes) || !episodes.every(isEpisode)
    || typeof clearExisting !== 'boolean'
    || (importStatus !== undefined && !['pending', 'completed'].includes(importStatus))) {
    throw new ApiError('INVALID_PARAMS')
  }
  const project = await prisma.novelPromotionProject.findFirst({ where: { projectId } })
  if (!project) throw new ApiError('NOT_FOUND')

  const created = await prisma.$transaction(async (tx) => {
    // Serialize imports; replacement and metadata must commit together.
    await tx.$queryRaw`SELECT id FROM novel_promotion_projects WHERE id = ${project.id} FOR UPDATE`
    if (clearExisting) {
      await tx.novelPromotionEpisode.deleteMany({ where: { novelPromotionProjectId: project.id } })
    }
    const last = await tx.novelPromotionEpisode.findFirst({
      where: { novelPromotionProjectId: project.id }, orderBy: { episodeNumber: 'desc' },
    })
    const rows = []
    for (const [index, episode] of (episodes as BatchEpisode[]).entries()) {
      rows.push(await tx.novelPromotionEpisode.create({ data: {
        novelPromotionProjectId: project.id,
        episodeNumber: (last?.episodeNumber || 0) + index + 1,
        name: episode.name.trim(), description: episode.description || null, novelText: episode.novelText,
      } }))
    }
    await tx.novelPromotionProject.update({ where: { id: project.id }, data: {
      ...(rows.length ? { lastEpisodeId: rows[0].id } : clearExisting ? { lastEpisodeId: null } : {}),
      ...(importStatus !== undefined ? { importStatus } : {}),
    } })
    return rows
  }, { timeout: 30000 })

  return NextResponse.json({ success: true, episodes: created.map((episode) => ({
    id: episode.id, episodeNumber: episode.episodeNumber, name: episode.name,
  })) })
})
