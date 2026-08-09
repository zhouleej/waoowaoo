import { NextRequest, NextResponse } from 'next/server'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { ApiError, apiHandler, getRequestId } from '@/lib/api-errors'
import { getUserModelConfig } from '@/lib/config-service'
import { parseModelKeyStrict } from '@/lib/model-config-contract'
import { resolveRequiredTaskLocale } from '@/lib/task/resolve-locale'
import { submitTask } from '@/lib/task/submitter'
import { TASK_TYPE } from '@/lib/task/types'

function parseTrustedAssetUri(value: unknown): string {
  const uri = typeof value === 'string' ? value.trim() : ''
  if (!/^asset:\/\/[A-Za-z0-9._:-]+$/.test(uri)) throw new ApiError('INVALID_PARAMS')
  return uri
}

function parsePrompt(value: unknown): string {
  const prompt = typeof value === 'string' ? value.trim() : ''
  if (!prompt || prompt.length > 500) throw new ApiError('INVALID_PARAMS')
  return prompt
}

/**
 * 虚拟人素材试用：使用已审核的 asset:// 素材生成一条低规格短视频，
 * 不写入项目或资产库，用于在正式创作前验证人脸一致性和素材可用状态。
 */
export const POST = apiHandler(async (request: NextRequest) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>

  const assetUri = parseTrustedAssetUri(body.assetUri)
  const prompt = parsePrompt(body.prompt)
  const config = await getUserModelConfig(session.user.id)
  const videoModel = typeof body.videoModel === 'string' && body.videoModel.trim()
    ? body.videoModel.trim()
    : config.videoModel
  const parsedModel = parseModelKeyStrict(videoModel)
  if (!parsedModel || parsedModel.provider !== 'maas-seedance') {
    throw new ApiError('INVALID_PARAMS', {
      code: 'VIRTUAL_HUMAN_TRIAL_REQUIRES_MAAS_SEEDANCE',
      field: 'videoModel',
    })
  }

  const locale = resolveRequiredTaskLocale(request, body)
  const result = await submitTask({
    userId: session.user.id,
    locale,
    requestId: getRequestId(request),
    projectId: 'global-asset-hub',
    type: TASK_TYPE.ASSET_HUB_VIRTUAL_HUMAN_TRIAL,
    targetType: 'VirtualHumanTrial',
    targetId: session.user.id,
    payload: {
      assetUri,
      prompt,
      videoModel,
      generationOptions: { resolution: '480p', duration: 4, aspectRatio: '16:9', generateAudio: false },
    },
    dedupeKey: `asset_hub_virtual_human_trial:${session.user.id}:${assetUri}:${prompt}`,
  })
  return NextResponse.json(result)
})
