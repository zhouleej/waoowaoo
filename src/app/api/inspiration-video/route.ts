import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler } from '@/lib/api-errors'
import { getSignedUrl } from '@/lib/storage'
import { resolveInspirationVideoWorkspace } from '@/lib/inspiration-video/workspace'

export const GET = apiHandler(async () => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  const resolved = await resolveInspirationVideoWorkspace(session.user.id)
  if ('error' in resolved) return resolved.error
  const { workspace } = resolved

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
      orderBy: { createdAt: 'desc' },
      take: 60,
      include: {
        assets: {
          orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }],
        },
      },
    }),
  ])

  const creationIds = creations.map((creation) => creation.id)
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
    creations: creations.map((creation) => {
      const task = taskByCreationId.get(creation.id)
      const primaryImage = creation.assets.find((asset) => asset.kind === 'primary_image')
      const referenceImages = creation.assets.filter((asset) => asset.kind === 'reference_image')
      const referenceAudios = creation.assets.filter((asset) => asset.kind === 'reference_audio')
      return {
        id: creation.id,
        prompt: creation.prompt,
        modelKey: creation.modelKey,
        aspectRatio: creation.aspectRatio,
        resolution: creation.resolution,
        duration: creation.duration,
        generateAudio: creation.generateAudio,
        createdAt: creation.createdAt.toISOString(),
        status: task?.status || (creation.outputVideoKey ? 'completed' : 'queued'),
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
