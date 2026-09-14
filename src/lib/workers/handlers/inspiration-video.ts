import type { Job } from 'bullmq'
import { getProviderKey } from '@/lib/api-config'
import { normalizeToBase64ForGeneration } from '@/lib/media/outbound-image'
import { resolveBuiltinCapabilitiesByModelKey } from '@/lib/model-capabilities/lookup'
import { parseModelKeyStrict } from '@/lib/model-config-contract'
import { mobileCloudMaasAssetClient } from '@/lib/mobile-cloud-maas/asset-client'
import { prisma } from '@/lib/prisma'
import { getSignedObjectUrl, getStorageProxyUrl, uploadObject } from '@/lib/storage'
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

type MobileCloudReferenceImage = {
  assetId: string
  sortOrder: number
}

type MobileCloudImageInputs = {
  primaryImageAssetId: string | null
  referenceImages: MobileCloudReferenceImage[]
}

function parseMobileCloudAssetId(value: unknown, field: string): string {
  const assetId = typeof value === 'string' ? value.trim() : ''
  if (!assetId || !/^[A-Za-z0-9._:-]+$/.test(assetId)) {
    throw new Error(`INSPIRATION_MOBILE_CLOUD_ASSET_ID_INVALID: ${field}`)
  }
  return assetId
}

function parseMobileCloudImageInputs(payload: Record<string, unknown> | null | undefined): MobileCloudImageInputs {
  const raw = payload?.mobileCloudAssets
  if (raw === undefined || raw === null) {
    return { primaryImageAssetId: null, referenceImages: [] }
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('INSPIRATION_MOBILE_CLOUD_ASSET_INPUT_INVALID')
  }

  const input = raw as Record<string, unknown>
  const primaryImageAssetId = input.primaryImageAssetId === null || input.primaryImageAssetId === undefined
    ? null
    : parseMobileCloudAssetId(input.primaryImageAssetId, 'primaryImageAssetId')
  if (!Array.isArray(input.referenceImages)) {
    throw new Error('INSPIRATION_MOBILE_CLOUD_REFERENCE_INPUT_INVALID')
  }

  const usedSortOrders = new Set<number>()
  const referenceImages = input.referenceImages.map((value, index) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`INSPIRATION_MOBILE_CLOUD_REFERENCE_INPUT_INVALID: ${index}`)
    }
    const reference = value as Record<string, unknown>
    const sortOrder = reference.sortOrder
    if (!Number.isInteger(sortOrder) || (sortOrder as number) < 0 || usedSortOrders.has(sortOrder as number)) {
      throw new Error(`INSPIRATION_MOBILE_CLOUD_REFERENCE_ORDER_INVALID: ${index}`)
    }
    usedSortOrders.add(sortOrder as number)
    return {
      assetId: parseMobileCloudAssetId(reference.assetId, `referenceImages[${index}].assetId`),
      sortOrder: sortOrder as number,
    }
  })

  return { primaryImageAssetId, referenceImages }
}

async function resolveActiveMobileCloudImageUri(assetId: string): Promise<string> {
  let asset: Awaited<ReturnType<typeof mobileCloudMaasAssetClient.getAsset>>
  try {
    asset = await mobileCloudMaasAssetClient.getAsset(assetId)
  } catch {
    throw new Error('INSPIRATION_MOBILE_CLOUD_ASSET_STATUS_UNAVAILABLE')
  }
  if (asset.assetId !== assetId || asset.assetType !== 'Image') {
    throw new Error('INSPIRATION_MOBILE_CLOUD_ASSET_TYPE_INVALID')
  }
  if (asset.status === 'FAILED') {
    throw new Error('INSPIRATION_MOBILE_CLOUD_ASSET_FAILED')
  }
  if (asset.status !== 'ACTIVE') {
    throw new Error('INSPIRATION_MOBILE_CLOUD_ASSET_PROCESSING')
  }
  return `asset://${assetId}`
}

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
  const useDirectStorageUrl = getProviderKey(parsedModel?.provider).toLowerCase() === 'maas-seedance'
  const mobileCloudInputs = parseMobileCloudImageInputs(job.data.payload)
  const primaryMobileCloudAssetUri = useDirectStorageUrl && mobileCloudInputs.primaryImageAssetId
    ? await resolveActiveMobileCloudImageUri(mobileCloudInputs.primaryImageAssetId)
    : null
  const builtinCapabilities = resolveBuiltinCapabilitiesByModelKey('video', creation.modelKey)
  const hasGenerateAudioOption = !builtinCapabilities
    || Array.isArray(builtinCapabilities.video?.generateAudioOptions)
  if (!primaryImage && !primaryMobileCloudAssetUri && builtinCapabilities?.video?.textToVideo !== true) {
    throw new Error('INSPIRATION_VIDEO_PRIMARY_IMAGE_REQUIRED')
  }
  const toGenerationUrl = async (key: string) => useDirectStorageUrl
    ? await getSignedObjectUrl(key, 7_200)
    : getStorageProxyUrl(key, 7_200)
  const primaryImageUrl = primaryImage ? getStorageProxyUrl(primaryImage.storageKey, 7_200) : ''
  const imageUrl = primaryMobileCloudAssetUri || (!primaryImage ? '' : useDirectStorageUrl
    ? await getSignedObjectUrl(primaryImage.storageKey, 7_200)
    : await normalizeToBase64ForGeneration(primaryImageUrl))
  const mobileCloudReferenceBySortOrder = new Map(
    mobileCloudInputs.referenceImages.map((reference) => [reference.sortOrder, reference.assetId]),
  )
  const referenceImages = await Promise.all(creation.assets
    .filter((asset) => asset.kind === 'reference_image')
    .map(async (asset) => {
      const mobileCloudAssetId = useDirectStorageUrl
        ? mobileCloudReferenceBySortOrder.get(asset.sortOrder)
        : undefined
      if (mobileCloudAssetId) {
        mobileCloudReferenceBySortOrder.delete(asset.sortOrder)
        return await resolveActiveMobileCloudImageUri(mobileCloudAssetId)
      }
      return await toGenerationUrl(asset.storageKey)
    }))
  if (useDirectStorageUrl && mobileCloudReferenceBySortOrder.size > 0) {
    throw new Error('INSPIRATION_MOBILE_CLOUD_REFERENCE_MAPPING_INVALID')
  }
  const referenceAudios = await Promise.all(creation.assets
    .filter((asset) => asset.kind === 'reference_audio')
    .map((asset) => toGenerationUrl(asset.storageKey)))

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
