import type { Job } from 'bullmq'
import { getProviderKey } from '@/lib/api-config'
import { getPublicBaseUrl } from '@/lib/env'
import { normalizeToBase64ForGeneration } from '@/lib/media/outbound-image'
import { resolveBuiltinCapabilitiesByModelKey } from '@/lib/model-capabilities/lookup'
import { parseModelKeyStrict } from '@/lib/model-config-contract'
import { prisma } from '@/lib/prisma'
import { getStorageProxyUrl, uploadObject } from '@/lib/storage'
import { createScopedLogger } from '@/lib/logging/core'
import {
  GENERATED_VIDEO_THUMBNAIL_KIND,
  shouldExtractInspirationVideoThumbnail,
} from '@/lib/inspiration-video/thumbnail'
import { extractStoredVideoFirstFrame } from '@/lib/media/video-thumbnail'
import type { TaskJobData } from '@/lib/task/types'
import { inspectGeneratedVideo } from '@/lib/media/video-metadata'
import { reportTaskProgress } from '@/lib/workers/shared'
import {
  assertTaskActive,
  resolveVideoSourceFromGeneration,
  uploadVideoSourceToCos,
} from '@/lib/workers/utils'

export async function handleInspirationVideoTask(job: Job<TaskJobData>) {
  const logger = createScopedLogger({
    module: 'worker.inspiration-video',
    taskId: job.data.taskId,
    projectId: job.data.projectId,
    userId: job.data.userId,
  })
  const creation = await prisma.inspirationVideoCreation.findUnique({
    where: { id: job.data.targetId },
    include: {
      workspace: { select: { projectId: true } },
      assets: { orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }] },
    },
  })
  if (!creation || creation.workspace.projectId !== job.data.projectId) {
    throw new Error('INSPIRATION_VIDEO_CREATION_NOT_FOUND')
  }

  const primaryImage = creation.assets.find((asset) => asset.kind === 'primary_image')


  const parsedModel = parseModelKeyStrict(creation.modelKey)
  const usePublicMediaUrl = getProviderKey(parsedModel?.provider).toLowerCase() === 'maas-seedance'
  const builtinCapabilities = resolveBuiltinCapabilitiesByModelKey('video', creation.modelKey)
  const hasGenerateAudioOption = !builtinCapabilities
    || Array.isArray(builtinCapabilities.video?.generateAudioOptions)
  if (!primaryImage && builtinCapabilities?.video?.textToVideo !== true) throw new Error('INSPIRATION_VIDEO_PRIMARY_IMAGE_REQUIRED')
  const publicBaseUrl = getPublicBaseUrl()
  const toPublicProxyUrl = (key: string) => new URL(getStorageProxyUrl(key, 7_200), publicBaseUrl).toString()
  const toGenerationProxyUrl = (key: string) => usePublicMediaUrl
    ? toPublicProxyUrl(key)
    : getStorageProxyUrl(key, 7_200)
  const primaryImageUrl = primaryImage ? getStorageProxyUrl(primaryImage.storageKey, 7_200) : ''
  const imageUrl = !primaryImage ? '' : usePublicMediaUrl
    ? new URL(primaryImageUrl, publicBaseUrl).toString()
    : await normalizeToBase64ForGeneration(primaryImageUrl)
  const referenceImages = creation.assets
    .filter((asset) => asset.kind === 'reference_image')
    .map((asset) => toGenerationProxyUrl(asset.storageKey))
  const referenceAudios = creation.assets
    .filter((asset) => asset.kind === 'reference_audio')
    .map((asset) => toGenerationProxyUrl(asset.storageKey))

  await reportTaskProgress(job, 15, {
    stage: 'inspiration_video_submit',
    creationId: creation.id,
  })
  const generatedVideo = await resolveVideoSourceFromGeneration(job, {
    userId: job.data.userId,
    modelId: creation.modelKey,
    imageUrl,
    options: {
      prompt: creation.prompt,
      aspectRatio: creation.aspectRatio,
      resolution: creation.resolution,
      duration: creation.duration,
      generationMode: 'normal',
      ...(hasGenerateAudioOption ? { generateAudio: creation.generateAudio } : {}),
      ...(referenceImages.length > 0 ? { referenceImages } : {}),
      ...(referenceAudios.length > 0 ? { referenceAudios } : {}),
    },
    pollProgress: { start: 32, end: 92 },
  })

  await assertTaskActive(job, 'persist_inspiration_video')
  await reportTaskProgress(job, 94, {
    stage: 'inspiration_video_persist',
    creationId: creation.id,
  })
  const outputVideoKey = await uploadVideoSourceToCos(
    generatedVideo.url,
    'inspiration-video',
    creation.id,
    generatedVideo.downloadHeaders,
  )
  const metadata = await inspectGeneratedVideo(outputVideoKey)
  if (shouldExtractInspirationVideoThumbnail(job.data.payload, creation.assets)) {
    try {
      const thumbnail = await extractStoredVideoFirstFrame(outputVideoKey)
      const thumbnailKey = `images/inspiration-video/${creation.id}/output-thumbnail.jpg`
      await uploadObject(thumbnail, thumbnailKey, 3, 'image/jpeg')
      const existingThumbnail = creation.assets.find((asset) => asset.kind === GENERATED_VIDEO_THUMBNAIL_KIND)
      if (existingThumbnail) {
        await prisma.inspirationVideoAsset.update({
          where: { id: existingThumbnail.id },
          data: {
            storageKey: thumbnailKey,
            originalName: 'output-thumbnail.jpg',
            mimeType: 'image/jpeg',
            sizeBytes: thumbnail.length,
            sortOrder: 0,
          },
        })
      } else {
        await prisma.inspirationVideoAsset.create({
          data: {
            creationId: creation.id,
            kind: GENERATED_VIDEO_THUMBNAIL_KIND,
            storageKey: thumbnailKey,
            originalName: 'output-thumbnail.jpg',
            mimeType: 'image/jpeg',
            sizeBytes: thumbnail.length,
            sortOrder: 0,
          },
        })
      }
    } catch (error) {
      logger.warn({
        action: 'worker.inspiration-video.thumbnail.failed',
        message: 'Failed to extract inspiration video thumbnail; preserving completed video output',
        details: { creationId: creation.id, outputVideoKey },
        error: error instanceof Error
          ? { name: error.name, message: error.message, stack: error.stack }
          : { message: String(error) },
      })
    }
  }
  await assertTaskActive(job, 'persist_inspiration_video_result')
  await prisma.inspirationVideoCreation.update({
    where: { id: creation.id },
    data: { outputVideoKey },
  })

  return {
    creationId: creation.id,
    videoUrl: outputVideoKey,
    metadata,
    ...(typeof generatedVideo.actualVideoTokens === 'number'
      ? { actualVideoTokens: generatedVideo.actualVideoTokens }
      : {}),
  }
}
