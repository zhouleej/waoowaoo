import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError, getRequestId } from '@/lib/api-errors'
import { submitTask } from '@/lib/task/submitter'
import { collectBatchSubmissions } from '@/lib/task/batch-submit'
import { resolveRequiredTaskLocale } from '@/lib/task/resolve-locale'
import { TASK_TYPE } from '@/lib/task/types'
import { buildDefaultTaskBillingInfo } from '@/lib/billing'
import { resolveVideoInputPricingSelections } from '@/lib/billing/video-input-selections'
import { BillingOperationError } from '@/lib/billing/errors'
import { hasPanelVideoOutput } from '@/lib/task/has-output'
import { withTaskUiPayload } from '@/lib/task/ui-payload'
import { parseModelKeyStrict, type CapabilityValue } from '@/lib/model-config-contract'
import {
  resolveBuiltinCapabilitiesByModelKey,
} from '@/lib/model-capabilities/lookup'
import { resolveBuiltinPricing } from '@/lib/model-pricing/lookup'
import { resolveProjectModelCapabilityGenerationOptions } from '@/lib/config-service'
import {
  requireNovelPromotionEpisodeInProject,
  requireNovelPromotionPanelByStoryboardIndexInProject,
} from '@/lib/saas/novel-promotion-resource-access'

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function toVideoRuntimeSelections(value: unknown): Record<string, CapabilityValue> {
  if (!isRecord(value)) return {}
  const selections: Record<string, CapabilityValue> = {}
  for (const [field, raw] of Object.entries(value)) {
    if (field === 'aspectRatio') continue
    if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') {
      selections[field] = raw
    }
  }
  return selections
}

function resolveVideoGenerationMode(payload: unknown): 'normal' | 'firstlastframe' {
  if (!isRecord(payload)) return 'normal'
  return isRecord(payload.firstLastFrame) ? 'firstlastframe' : 'normal'
}

function applyProjectVideoResolution(
  payload: unknown,
  projectVideoResolution: string | null | undefined,
): Record<string, unknown> {
  const normalizedPayload = isRecord(payload) ? payload : {}
  if (!projectVideoResolution) return normalizedPayload

  const rawGenerationOptions = normalizedPayload.generationOptions
  const generationOptions = isRecord(rawGenerationOptions) ? rawGenerationOptions : {}
  if (typeof generationOptions.resolution === 'string' && generationOptions.resolution.trim()) {
    return normalizedPayload
  }

  return {
    ...normalizedPayload,
    generationOptions: {
      ...generationOptions,
      resolution: projectVideoResolution,
    },
  }
}

function resolveVideoModelKeyFromPayload(payload: Record<string, unknown>): string | null {
  const firstLast = isRecord(payload.firstLastFrame) ? payload.firstLastFrame : null
  if (firstLast && typeof firstLast.flModel === 'string' && parseModelKeyStrict(firstLast.flModel)) {
    return firstLast.flModel
  }
  if (typeof payload.videoModel === 'string' && parseModelKeyStrict(payload.videoModel)) {
    return payload.videoModel
  }
  return null
}

function requireVideoModelKeyFromPayload(payload: unknown): string {
  if (!isRecord(payload) || typeof payload.videoModel !== 'string' || !parseModelKeyStrict(payload.videoModel)) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'VIDEO_MODEL_REQUIRED',
      field: 'videoModel',
    })
  }
  return payload.videoModel
}

function validateFirstLastFrameModel(input: unknown) {
  if (input === undefined || input === null) return
  if (!isRecord(input)) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'FIRSTLASTFRAME_PAYLOAD_INVALID',
      field: 'firstLastFrame',
    })
  }

  const flModel = input.flModel
  if (typeof flModel !== 'string' || !parseModelKeyStrict(flModel)) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'FIRSTLASTFRAME_MODEL_INVALID',
      field: 'firstLastFrame.flModel',
    })
  }

  const capabilities = resolveBuiltinCapabilitiesByModelKey('video', flModel)
  if (capabilities?.video?.firstlastframe !== true) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'FIRSTLASTFRAME_MODEL_UNSUPPORTED',
      field: 'firstLastFrame.flModel',
    })
  }
}

async function validateVideoCapabilityCombination(input: {
  payload: unknown
  projectId: string
  userId: string
}) {
  const payload = input.payload
  if (!isRecord(payload)) return
  const modelKey = resolveVideoModelKeyFromPayload(payload)
  if (!modelKey) return

  // Skip validation for models not in the built-in capability catalog
  const builtinCaps = resolveBuiltinCapabilitiesByModelKey('video', modelKey)
  if (!builtinCaps) return

  const runtimeSelections = toVideoRuntimeSelections(payload.generationOptions)
  runtimeSelections.generationMode = resolveVideoGenerationMode(payload)

  let resolvedOptions: Record<string, CapabilityValue>
  try {
    resolvedOptions = await resolveProjectModelCapabilityGenerationOptions({
      projectId: input.projectId,
      userId: input.userId,
      modelType: 'video',
      modelKey,
      runtimeSelections,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new ApiError('INVALID_PARAMS', {
      code: 'VIDEO_CAPABILITY_COMBINATION_UNSUPPORTED',
      field: 'generationOptions',
      details: {
        model: modelKey,
        selections: runtimeSelections,
        message,
      },
    })
  }

  const resolution = resolveBuiltinPricing({
    apiType: 'video',
    model: modelKey,
    selections: {
      ...resolvedOptions,
      ...resolveVideoInputPricingSelections(payload),
    },
  })
  if (resolution.status === 'missing_capability_match') {
    throw new ApiError('INVALID_PARAMS', {
      code: 'VIDEO_CAPABILITY_COMBINATION_UNSUPPORTED',
      field: 'generationOptions',
      details: {
        model: modelKey,
        selections: resolvedOptions,
      },
    })
  }
}

function buildVideoPanelBillingInfoOrThrow(payload: unknown) {
  try {
    return buildDefaultTaskBillingInfo(TASK_TYPE.VIDEO_PANEL, isRecord(payload) ? payload : null)
  } catch (error) {
    if (
      error instanceof BillingOperationError
      && (
        error.code === 'BILLING_UNKNOWN_VIDEO_CAPABILITY_COMBINATION'
        || error.code === 'BILLING_UNKNOWN_VIDEO_RESOLUTION'
      )
    ) {
      throw new ApiError('INVALID_PARAMS', {
        code: 'VIDEO_CAPABILITY_COMBINATION_UNSUPPORTED',
        field: 'generationOptions',
      })
    }
    // Model not in built-in pricing catalog — allow task to proceed;
    // actual billing will be resolved downstream where billing mode is checked.
    if (
      error instanceof BillingOperationError
      && error.code === 'BILLING_UNKNOWN_MODEL'
    ) {
      return null
    }
    throw error
  }
}

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params

  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  const requestBody = await request.json()
  const projectConfig = await prisma.novelPromotionProject.findUnique({
    where: { projectId },
    select: { videoResolution: true },
  })
  const body = applyProjectVideoResolution(requestBody, projectConfig?.videoResolution)
  requireVideoModelKeyFromPayload(body)
  const locale = resolveRequiredTaskLocale(request, body)
  const isBatch = body.all === true

  validateFirstLastFrameModel(body?.firstLastFrame)
  if (isRecord(body.firstLastFrame)) {
    const last = body.firstLastFrame
    if (typeof last.lastFrameStoryboardId !== 'string' || !Number.isInteger(last.lastFramePanelIndex)) {
      throw new ApiError('INVALID_PARAMS', { message: '首尾帧生成需要选择有效尾帧' })
    }
    const tail = await requireNovelPromotionPanelByStoryboardIndexInProject(projectId, last.lastFrameStoryboardId, Number(last.lastFramePanelIndex))
    if (!tail.imageUrl) throw new ApiError('INVALID_PARAMS', { message: '所选尾帧尚未生成图片' })
  }
  await validateVideoCapabilityCombination({
    payload: body,
    projectId,
    userId: session.user.id,
  })

  if (isBatch) {
    const episodeId = typeof body.episodeId === 'string' ? body.episodeId : null
    if (!episodeId) {
      throw new ApiError('INVALID_PARAMS')
    }

    await requireNovelPromotionEpisodeInProject(projectId, episodeId)

    const panels = await prisma.novelPromotionPanel.findMany({
      where: {
        storyboard: {
          episodeId,
          episode: {
            novelPromotionProject: { projectId },
          },
        },
        imageUrl: { not: null },
        OR: [
          { videoUrl: null },
          { videoUrl: '' },
        ],
      },
      select: { id: true },
    })

    if (panels.length === 0) {
      return NextResponse.json({ tasks: [], total: 0 })
    }

    const results = await collectBatchSubmissions(
      panels, async (panel) =>
        submitTask({
          userId: session.user.id,
          locale,
          requestId: getRequestId(request),
          projectId,
          episodeId,
          type: TASK_TYPE.VIDEO_PANEL,
          targetType: 'NovelPromotionPanel',
          targetId: panel.id,
          payload: withTaskUiPayload(body, {
            hasOutputAtStart: await hasPanelVideoOutput(panel.id),
          }),
          dedupeKey: `video_panel:${panel.id}`,
          billingInfo: buildVideoPanelBillingInfoOrThrow(body),
        }),
    )

    return NextResponse.json({ tasks: results.accepted, total: panels.length, rejected: results.rejected })
  }

  const storyboardId = typeof body.storyboardId === 'string' ? body.storyboardId : null
  const panelIndex = body.panelIndex
  if (!storyboardId || panelIndex === undefined) {
    throw new ApiError('INVALID_PARAMS')
  }

  const panel = await requireNovelPromotionPanelByStoryboardIndexInProject(projectId, storyboardId, Number(panelIndex))

  const result = await submitTask({
    userId: session.user.id,
    locale,
    requestId: getRequestId(request),
    projectId,
    type: TASK_TYPE.VIDEO_PANEL,
    targetType: 'NovelPromotionPanel',
    targetId: panel.id,
    payload: withTaskUiPayload(body, {
      hasOutputAtStart: await hasPanelVideoOutput(panel.id),
    }),
    dedupeKey: `video_panel:${panel.id}`,
    billingInfo: buildVideoPanelBillingInfoOrThrow(body),
  })

  return NextResponse.json(result)
})
