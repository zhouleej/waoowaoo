import type { Job } from 'bullmq'
import { getProviderKey } from '@/lib/api-config'
import { getPublicBaseUrl } from '@/lib/env'
import { normalizeToBase64ForGeneration, normalizeToOriginalMediaUrl } from '@/lib/media/outbound-image'
import { resolveBuiltinCapabilitiesByModelKey } from '@/lib/model-capabilities/lookup'
import { parseModelKeyStrict } from '@/lib/model-config-contract'
import { prisma } from '@/lib/prisma'
import { getSignedUrl } from '@/lib/storage'
import type { TaskJobData } from '@/lib/task/types'
import { reportTaskProgress } from '@/lib/workers/shared'
import {
  assertTaskActive,
  resolveVideoSourceFromGeneration,
  uploadVideoSourceToCos,
} from '@/lib/workers/utils'

export async function handleInspirationVideoTask(job: Job<TaskJobData>) {
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
  if (!primaryImage) throw new Error('INSPIRATION_VIDEO_PRIMARY_IMAGE_REQUIRED')

  const parsedModel = parseModelKeyStrict(creation.modelKey)
  const usePublicMediaUrl = getProviderKey(parsedModel?.provider).toLowerCase() === 'maas-seedance'
  const builtinCapabilities = resolveBuiltinCapabilitiesByModelKey('video', creation.modelKey)
  const hasGenerateAudioOption = !builtinCapabilities
    || Array.isArray(builtinCapabilities.video?.generateAudioOptions)
  const primaryImageUrl = getSignedUrl(primaryImage.storageKey, 7_200)
  const imageUrl = usePublicMediaUrl
    ? await normalizeToOriginalMediaUrl(primaryImageUrl, { absoluteBaseUrl: getPublicBaseUrl() })
    : await normalizeToBase64ForGeneration(primaryImageUrl)
  const referenceImages = creation.assets
    .filter((asset) => asset.kind === 'reference_image')
    .map((asset) => getSignedUrl(asset.storageKey, 7_200))
  const referenceAudios = creation.assets
    .filter((asset) => asset.kind === 'reference_audio')
    .map((asset) => getSignedUrl(asset.storageKey, 7_200))

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
  await assertTaskActive(job, 'persist_inspiration_video_result')
  await prisma.inspirationVideoCreation.update({
    where: { id: creation.id },
    data: { outputVideoKey },
  })

  return {
    creationId: creation.id,
    videoUrl: outputVideoKey,
    ...(typeof generatedVideo.actualVideoTokens === 'number'
      ? { actualVideoTokens: generatedVideo.actualVideoTokens }
      : {}),
  }
}
