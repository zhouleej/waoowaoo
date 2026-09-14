import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { ApiError, apiHandler, getRequestId } from '@/lib/api-errors'
import { getProviderKey, resolveModelSelection } from '@/lib/api-config'
import { resolveProjectModelCapabilityGenerationOptions } from '@/lib/config-service'
import { resolveBuiltinCapabilitiesByModelKey } from '@/lib/model-capabilities/lookup'
import { resolveInspirationVideoWorkspace } from '@/lib/inspiration-video/workspace'
import {
  INSPIRATION_VIDEO_LIMITS,
  parseInspirationVideoDraft,
  type InspirationVideoDraft,
  type UploadFile,
} from '@/lib/inspiration-video/validation'
import { prisma } from '@/lib/prisma'
import { deleteObjects, generateUniqueKey, uploadObject } from '@/lib/storage'
import { resolveRequiredTaskLocale } from '@/lib/task/resolve-locale'
import { submitTask } from '@/lib/task/submitter'
import { TASK_TYPE } from '@/lib/task/types'
import { findAcceptedSubmission, submissionCreationId } from '@/lib/inspiration-video/submission'
import { createScopedLogger } from '@/lib/logging/core'
import {
  loadMobileCloudImage,
  type LoadedMobileCloudImage,
} from '@/lib/inspiration-video/mobile-cloud-image'

const routeLogger = createScopedLogger({ module: 'api.inspiration-video.generate' })

type UploadedAsset = {
  kind: 'primary_image' | 'reference_image' | 'reference_audio'
  storageKey: string
  originalName: string
  mimeType: string
  sizeBytes: number
  sortOrder: number
}

function extensionOf(fileName: string): string {
  return fileName.split('.').pop()?.toLowerCase() || 'bin'
}

function safeOriginalName(fileName: string): string {
  if (fileName.length <= 190) return fileName
  const lastDot = fileName.lastIndexOf('.')
  if (lastDot <= 0 || fileName.length - lastDot > 20) return fileName.slice(0, 190)
  const extension = fileName.slice(lastDot + 1)
  return `${fileName.slice(0, 189 - extension.length)}.${extension}`
}

async function uploadImageBuffer(
  creationId: string,
  body: Buffer,
  originalName: string,
  kind: UploadedAsset['kind'],
  sortOrder: number,
): Promise<UploadedAsset> {
  let processed: Buffer
  try {
    processed = await sharp(body)
      .rotate()
      .jpeg({ quality: 92, mozjpeg: true })
      .toBuffer()
  } catch {
    throw new ApiError('INVALID_PARAMS', {
      code: 'INSPIRATION_IMAGE_CONTENT_INVALID',
      field: kind === 'primary_image' ? 'primaryImage' : `referenceImages.${sortOrder}`,
    })
  }
  const key = generateUniqueKey(`inspiration-video/${creationId}/${kind}-${sortOrder}`, 'jpg')
  await uploadObject(processed, key, 3, 'image/jpeg')
  return {
    kind,
    storageKey: key,
    originalName: safeOriginalName(originalName),
    mimeType: 'image/jpeg',
    sizeBytes: processed.length,
    sortOrder,
  }
}

async function uploadImage(
  creationId: string,
  file: UploadFile,
  kind: UploadedAsset['kind'],
  sortOrder: number,
): Promise<UploadedAsset> {
  return uploadImageBuffer(
    creationId,
    Buffer.from(await file.arrayBuffer()),
    file.name,
    kind,
    sortOrder,
  )
}

async function uploadAudio(
  creationId: string,
  file: UploadFile,
  sortOrder: number,
): Promise<UploadedAsset> {
  const body = Buffer.from(await file.arrayBuffer())
  const key = generateUniqueKey(
    `inspiration-video/${creationId}/reference_audio-${sortOrder}`,
    extensionOf(file.name),
  )
  await uploadObject(body, key, 3, file.type)
  return {
    kind: 'reference_audio',
    storageKey: key,
    originalName: safeOriginalName(file.name),
    mimeType: file.type,
    sizeBytes: body.length,
    sortOrder,
  }
}

async function uploadDraftAssets(
  creationId: string,
  draft: InspirationVideoDraft,
  mobileCloudImages: {
    primary: LoadedMobileCloudImage | null
    references: LoadedMobileCloudImage[]
  },
  onUploaded: (storageKey: string) => void,
): Promise<UploadedAsset[]> {
  const assets: UploadedAsset[] = []
  if (draft.primaryImage) {
    const primaryImage = await uploadImage(creationId, draft.primaryImage, 'primary_image', 0)
    assets.push(primaryImage)
    onUploaded(primaryImage.storageKey)
  } else if (mobileCloudImages.primary) {
    const primaryImage = await uploadImageBuffer(
      creationId,
      mobileCloudImages.primary.body,
      mobileCloudImages.primary.assetName,
      'primary_image',
      0,
    )
    assets.push(primaryImage)
    onUploaded(primaryImage.storageKey)
  }
  for (const [index, file] of draft.referenceImages.entries()) {
    const asset = await uploadImage(creationId, file, 'reference_image', index)
    assets.push(asset)
    onUploaded(asset.storageKey)
  }
  for (const [index, image] of mobileCloudImages.references.entries()) {
    const sortOrder = draft.referenceImages.length + index
    const asset = await uploadImageBuffer(
      creationId,
      image.body,
      image.assetName,
      'reference_image',
      sortOrder,
    )
    assets.push(asset)
    onUploaded(asset.storageKey)
  }
  for (const [index, file] of draft.referenceAudios.entries()) {
    const asset = await uploadAudio(creationId, file, index)
    assets.push(asset)
    onUploaded(asset.storageKey)
  }
  return assets
}

export const POST = apiHandler(async (request: NextRequest) => {
  const startedAt = Date.now()
  const requestId = getRequestId(request)
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult
  const logger = routeLogger.child({ requestId, userId: session.user.id })

  logger.event({
    level: 'INFO',
    action: 'inspiration.submit.received',
    message: 'Inspiration video submission received',
    details: { contentLength: request.headers.get('content-length') },
  })

  const formData = await request.formData()
  const draft = parseInspirationVideoDraft(formData)
  const locale = resolveRequiredTaskLocale(request, {
    locale: typeof formData.get('locale') === 'string' ? formData.get('locale') : undefined,
  })
  const uploadedAssetBytes = [draft.primaryImage, ...draft.referenceImages, ...draft.referenceAudios]
    .filter((file): file is UploadFile => Boolean(file))
    .reduce((sum, file) => sum + file.size, 0)
  logger.event({
    level: 'INFO',
    action: 'inspiration.submit.form_parsed',
    message: 'Inspiration video submission form parsed',
    durationMs: Date.now() - startedAt,
    details: {
      hasPrimaryImage: Boolean(draft.primaryImage),
      hasPrimaryMobileCloudImage: Boolean(draft.primaryMobileCloudAssetId),
      referenceImageCount: draft.referenceImages.length,
      referenceMobileCloudImageCount: draft.referenceMobileCloudAssetIds.length,
      referenceAudioCount: draft.referenceAudios.length,
      uploadedAssetBytes,
    },
  })

  const resolved = await resolveInspirationVideoWorkspace(session.user.id)
  if ('error' in resolved) return resolved.error
  const { workspace } = resolved
  const workspaceLogger = logger.child({ projectId: workspace.projectId })
  const creationId = submissionCreationId(session.user.id, workspace.id, formData.get('submissionId'))
  if (creationId) {
    const existing = await findAcceptedSubmission(creationId)
    if (existing) return NextResponse.json(existing, { status: 202 })
  }

  let selection: Awaited<ReturnType<typeof resolveModelSelection>>
  try {
    selection = await resolveModelSelection(session.user.id, draft.modelKey, 'video')
  } catch (error) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'INSPIRATION_VIDEO_MODEL_INVALID',
      field: 'modelKey',
      message: error instanceof Error ? error.message : undefined,
    })
  }

  const hasReferences = draft.referenceImages.length > 0
    || draft.referenceMobileCloudAssetIds.length > 0
    || draft.referenceAudios.length > 0
  if (hasReferences && getProviderKey(selection.provider).toLowerCase() !== 'maas-seedance') {
    throw new ApiError('INVALID_PARAMS', {
      code: 'INSPIRATION_REFERENCES_REQUIRE_MAAS_SEEDANCE',
      field: 'modelKey',
    })
  }
  if (draft.referenceAudios.length > 0 && !draft.generateAudio) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'INSPIRATION_REFERENCE_AUDIO_REQUIRES_AUDIO_OUTPUT',
      field: 'generateAudio',
    })
  }

  const builtinCapabilities = resolveBuiltinCapabilitiesByModelKey('video', selection.modelKey)
  const hasPrimaryImage = Boolean(draft.primaryImage || draft.primaryMobileCloudAssetId)
  if (!hasPrimaryImage && builtinCapabilities?.video?.textToVideo !== true) {
    throw new ApiError('INVALID_PARAMS', { message: '当前模型需要主图，请上传图片或选择支持纯文字生成的模型', field: 'primaryImage' })
  }
  const allowedRatios = builtinCapabilities?.video?.aspectRatios
  if (allowedRatios && !allowedRatios.includes(draft.aspectRatio)) throw new ApiError('INVALID_PARAMS', { message: '当前模型不支持所选画幅', field: 'aspectRatio' })
  const hasGenerateAudioOption = !builtinCapabilities
    || Array.isArray(builtinCapabilities.video?.generateAudioOptions)

  try {
    await resolveProjectModelCapabilityGenerationOptions({
      projectId: workspace.projectId,
      userId: session.user.id,
      modelType: 'video',
      modelKey: selection.modelKey,
      runtimeSelections: {
        duration: draft.duration,
        resolution: draft.resolution,
        generationMode: 'normal',
        ...(hasGenerateAudioOption ? { generateAudio: draft.generateAudio } : {}),
      },
    })
  } catch (error) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'INSPIRATION_VIDEO_OPTIONS_INVALID',
      field: 'generationOptions',
      message: error instanceof Error ? error.message : undefined,
    })
  }

  const [primaryMobileCloudImage, referenceMobileCloudImages] = await Promise.all([
    draft.primaryMobileCloudAssetId
      ? loadMobileCloudImage(draft.primaryMobileCloudAssetId, 'primaryMobileCloudAssetId')
      : Promise.resolve(null),
    Promise.all(draft.referenceMobileCloudAssetIds.map((assetId, index) => (
      loadMobileCloudImage(assetId, `referenceMobileCloudAssetIds.${index}`)
    ))),
  ])
  const mobileCloudAssetBytes = [primaryMobileCloudImage, ...referenceMobileCloudImages]
    .filter((image): image is LoadedMobileCloudImage => Boolean(image))
    .reduce((sum, image) => sum + image.body.length, 0)
  const totalAssetBytes = uploadedAssetBytes + mobileCloudAssetBytes
  if (totalAssetBytes > INSPIRATION_VIDEO_LIMITS.totalBytes) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'INSPIRATION_ASSETS_TOO_LARGE',
      field: 'assets',
      limit: INSPIRATION_VIDEO_LIMITS.totalBytes,
    })
  }

  const creation = await prisma.inspirationVideoCreation.create({
    data: {
      ...(creationId ? { id: creationId } : {}),
      workspaceId: workspace.id,
      prompt: draft.prompt,
      modelKey: selection.modelKey,
      aspectRatio: draft.aspectRatio,
      resolution: draft.resolution,
      duration: draft.duration,
      generateAudio: draft.generateAudio,
    },
  }).catch(async (error: unknown) => {
    if (creationId && error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
      throw new ApiError('CONFLICT', { message: '相同提交已在处理中，请稍后重试', creationId })
    }
    throw error
  })
  workspaceLogger.event({
    level: 'INFO',
    action: 'inspiration.submit.creation_created',
    message: 'Inspiration video creation record created',
    durationMs: Date.now() - startedAt,
    details: { creationId: creation.id },
  })
  const uploadedKeys: string[] = []

  async function rollbackCreatedRecord() {
    try {
      await prisma.inspirationVideoCreation.deleteMany({ where: { id: creation.id } })
    } finally {
      if (uploadedKeys.length > 0) await deleteObjects(uploadedKeys)
    }
  }

  let result: Awaited<ReturnType<typeof submitTask>>
  try {
    const assets = await uploadDraftAssets(
      creation.id,
      draft,
      { primary: primaryMobileCloudImage, references: referenceMobileCloudImages },
      (storageKey) => uploadedKeys.push(storageKey),
    )
    workspaceLogger.event({
      level: 'INFO',
      action: 'inspiration.submit.assets_uploaded',
      message: 'Inspiration video assets uploaded',
      durationMs: Date.now() - startedAt,
      details: { creationId: creation.id, assetCount: assets.length, totalAssetBytes },
    })
    await prisma.inspirationVideoAsset.createMany({
      data: assets.map((asset) => ({
        creationId: creation.id,
        ...asset,
      })),
    })

    result = await submitTask({
      userId: session.user.id,
      locale,
      requestId: getRequestId(request),
      projectId: workspace.projectId,
      type: TASK_TYPE.VIDEO_PANEL,
      targetType: 'InspirationVideoCreation',
      targetId: creation.id,
      payload: {
        videoModel: selection.modelKey,
        prompt: draft.prompt,
        generateThumbnailFromVideo: !hasPrimaryImage
          && draft.referenceImages.length === 0
          && draft.referenceMobileCloudAssetIds.length === 0,
        generationOptions: {
          aspectRatio: draft.aspectRatio,
          resolution: draft.resolution,
          duration: draft.duration,
          generationMode: 'normal',
          ...(hasGenerateAudioOption ? { generateAudio: draft.generateAudio } : {}),
        },
      },
      dedupeKey: `inspiration_video:${creation.id}`,
    })
  } catch (error) {
    workspaceLogger.event({
      level: 'ERROR',
      action: 'inspiration.submit.rolled_back',
      message: 'Inspiration video submission failed before task acceptance',
      durationMs: Date.now() - startedAt,
      details: { creationId: creation.id, uploadedAssetCount: uploadedKeys.length },
      error: error instanceof Error ? error : new Error(String(error)),
    })
    await rollbackCreatedRecord()
    throw error
  }

  workspaceLogger.event({
    level: 'INFO',
    action: 'inspiration.submit.task_accepted',
    message: 'Inspiration video task accepted',
    taskId: result.taskId,
    durationMs: Date.now() - startedAt,
    details: { creationId: creation.id },
  })

  await prisma.inspirationVideoCreation.update({
    where: { id: creation.id },
    data: { taskId: result.taskId },
  })
  workspaceLogger.event({
    level: 'INFO',
    action: 'inspiration.submit.completed',
    message: 'Inspiration video submission completed',
    taskId: result.taskId,
    durationMs: Date.now() - startedAt,
    details: { creationId: creation.id },
  })
  return NextResponse.json({
    ...result,
    creationId: creation.id,
  }, { status: 202 })
})
