import { NextRequest } from 'next/server'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { maybeSubmitLLMTask } from '@/lib/llm-observe/route-task'
import { TASK_TYPE } from '@/lib/task/types'

/**
 * POST /api/novel-promotion/[projectId]/analyze-character-voice
 * 根据人物档案、剧本语境和代表台词生成可编辑的声音特点建议。
 * 此接口只提交文本分析任务，不会触发音频生成或修改角色音色。
 */
export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const characterId = typeof body.characterId === 'string' ? body.characterId.trim() : ''

  if (!characterId) {
    throw new ApiError('INVALID_PARAMS')
  }

  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  const asyncTaskResponse = await maybeSubmitLLMTask({
    request,
    userId: session.user.id,
    projectId,
    type: TASK_TYPE.VOICE_ANALYZE,
    targetType: 'NovelPromotionCharacter',
    targetId: characterId,
    routePath: `/api/novel-promotion/${projectId}/analyze-character-voice`,
    body: {
      analysisKind: 'character_voice_prompt',
      characterId,
      displayMode: 'loading',
    },
    dedupeKey: `character_voice_prompt:${characterId}`,
    priority: 0,
  })
  if (asyncTaskResponse) return asyncTaskResponse

  throw new ApiError('INVALID_PARAMS')
})
