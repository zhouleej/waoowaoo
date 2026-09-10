import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { ApiError, apiHandler, getRequestId } from '@/lib/api-errors'
import { getProviderKey, resolveModelSelection } from '@/lib/api-config'
import { resolveProjectModelCapabilityGenerationOptions } from '@/lib/config-service'
import { resolveBuiltinCapabilitiesByModelKey } from '@/lib/model-capabilities/lookup'
import { resolveInspirationVideoWorkspace } from '@/lib/inspiration-video/workspace'
import {
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
  const extension = extensionOf(fileName)
  return `${fileName.slice(0, Math.max(1, 185 - extension.length))}.${extension}`
}

async function uploadImage(
  creationId: string,
  file: UploadFile,
  kind: UploadedAsset['kind'],
  sortOrder: number,
): Promise<UploadedAsset> {
  let processed: Buffer
  try {
    processed = await sharp(Buffer.from(await file.arrayBuffer()))
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
    originalName: safeOriginalName(file.name),
    mimeType: 'image/jpeg',
    sizeBytes: processed.length,
    sortOrder,
  }
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
  onUploaded: (storageKey: string) => void,
): Promise<UploadedAsset[]> {
  const assets: UploadedAsset[] = []
  if (draft.primaryImage) {
    const primaryImage = await uploadImage(creationId, draft.primaryImage, 'primary_image', 0)
    assets.push(primaryImage)
    onUploaded(primaryImage.storageKey)
  }
  for (const [index, file] of draft.referenceImages.entries()) {
    const asset = await uploadImage(creationId, file, 'reference_image', index)
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
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  const formData = await request.formData()
  const draft = parseInspirationVideoDraft(formData)
  const locale = resolveRequiredTaskLocale(request, {
    locale: typeof formData.get('locale') === 'string' ? formData.get('locale') : undefined,
  })

  const resolved = await resolveInspirationVideoWorkspace(session.user.id)
  if ('error' in resolved) return resolved.error
  const { workspace } = resolved
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

  const hasReferences = draft.referenceImages.length > 0 || draft.referenceAudios.length > 0
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
  if (!draft.primaryImage && builtinCapabilities?.video?.textToVideo !== true) {
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
    const assets = await uploadDraftAssets(creation.id, draft, (storageKey) => uploadedKeys.push(storageKey))
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
    await rollbackCreatedRecord()
    throw error
  }

  await prisma.inspirationVideoCreation.update({
    where: { id: creation.id },
    data: { taskId: result.taskId },
  })
  return NextResponse.json({
    ...result,
    creationId: creation.id,
  }, { status: 202 })
})
