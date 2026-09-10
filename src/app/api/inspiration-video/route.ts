import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { getSignedUrl } from '@/lib/storage'
import { resolveInspirationVideoWorkspace } from '@/lib/inspiration-video/workspace'
import { actOnCreation } from '@/lib/inspiration-video/actions'

export const POST = apiHandler(async (request: NextRequest) => {
  const auth = await requireUserAuth()
  if (isErrorResponse(auth)) return auth
  const resolved = await resolveInspirationVideoWorkspace(auth.session.user.id)
  if ('error' in resolved) return resolved.error
  return actOnCreation(request, auth.session.user.id, resolved.workspace)
})

export const GET = apiHandler(async (request: NextRequest) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  const resolved = await resolveInspirationVideoWorkspace(session.user.id)
  if ('error' in resolved) return resolved.error
  const { workspace } = resolved
  const cursor = request.nextUrl.searchParams.get('cursor')
  if (cursor && !await prisma.inspirationVideoCreation.findFirst({ where: { id: cursor, workspaceId: workspace.id }, select: { id: true } })) {
    throw new ApiError('INVALID_PARAMS', { field: 'cursor' })
  }

  const [preference, creations] = await Promise.all([
    prisma.userPreference.findUnique({
      where: { userId: session.user.id },
      select: {
        videoModel: true,
        videoRatio: true,
        videoResolution: true,
      },
    }),
    prisma.inspirationVideoCreation.findMany({
      where: { workspaceId: workspace.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 21,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        assets: {
          orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }],
        },
      },
    }),
  ])

  const page = creations.slice(0, 20)
  const creationIds = page.map((creation) => creation.id)
  const tasks = creationIds.length > 0
    ? await prisma.task.findMany({
      where: {
        projectId: workspace.projectId,
        targetType: 'InspirationVideoCreation',
        targetId: { in: creationIds },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        targetId: true,
        status: true,
        progress: true,
        errorCode: true,
        errorMessage: true,
        result: true,
      },
    })
    : []
  const taskByCreationId = new Map<string, (typeof tasks)[number]>()
  tasks.forEach((task) => {
    if (!taskByCreationId.has(task.targetId)) taskByCreationId.set(task.targetId, task)
  })

  return NextResponse.json({
    workspace: {
      projectId: workspace.projectId,
    },
    defaults: {
      videoModel: preference?.videoModel || null,
      aspectRatio: preference?.videoRatio || '16:9',
      resolution: preference?.videoResolution || '720p',
    },
    nextCursor: creations.length > 20 ? page[page.length - 1].id : null,
    creations: page.map((creation) => {
      const task = taskByCreationId.get(creation.id)
      const primaryImage = creation.assets.find((asset) => asset.kind === 'primary_image')
      const referenceImages = creation.assets.filter((asset) => asset.kind === 'reference_image')
      const referenceAudios = creation.assets.filter((asset) => asset.kind === 'reference_audio')
      return {
        id: creation.id,
        taskId: task?.id || null,
        prompt: creation.prompt,
        modelKey: creation.modelKey,
        aspectRatio: creation.aspectRatio,
        resolution: creation.resolution,
        duration: creation.duration,
        actualMetadata: task?.result && typeof task.result === 'object' && !Array.isArray(task.result) ? task.result.metadata : null,
        generateAudio: creation.generateAudio,
        createdAt: creation.createdAt.toISOString(),
        status: task?.status || (creation.outputVideoKey ? 'completed' : 'failed'),
        progress: task?.progress || (creation.outputVideoKey ? 100 : 0),
        errorCode: task?.errorCode || null,
        errorMessage: task?.errorMessage || null,
        primaryImage: primaryImage
          ? { name: primaryImage.originalName, url: getSignedUrl(primaryImage.storageKey, 7_200) }
          : null,
        referenceImages: referenceImages.map((asset) => ({
          name: asset.originalName,
          url: getSignedUrl(asset.storageKey, 7_200),
        })),
        referenceAudios: referenceAudios.map((asset) => ({
          name: asset.originalName,
          url: getSignedUrl(asset.storageKey, 7_200),
        })),
        videoUrl: creation.outputVideoKey ? getSignedUrl(creation.outputVideoKey, 7_200) : null,
      }
    }),
  })
})
