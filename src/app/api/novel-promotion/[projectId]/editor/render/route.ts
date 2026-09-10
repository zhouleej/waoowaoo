import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiHandler, ApiError, getRequestId } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuthLight } from '@/lib/api-auth'
import { submitTask } from '@/lib/task/submitter'
import { TASK_TYPE } from '@/lib/task/types'
import { resolveRequiredTaskLocale } from '@/lib/task/resolve-locale'
import { editorProjectSchema } from '@/features/video-editor/utils/project-schema'
import { authorizeEditorMedia } from '@/lib/video-editor/media-access'
import { getSignedUrl } from '@/lib/storage'

export const POST = apiHandler(async (request: NextRequest, context: { params: Promise<{ projectId: string }> }) => {
  const { projectId } = await context.params
  const auth = await requireProjectAuthLight(projectId)
  if (isErrorResponse(auth)) return auth
  const body = await request.json()
  if (typeof body.editorProjectId !== 'string') throw new ApiError('INVALID_PARAMS')
  const editor = await prisma.videoEditorProject.findFirst({
    where: { id: body.editorProjectId, episode: { novelPromotionProject: { projectId } } },
  })
  if (!editor) throw new ApiError('NOT_FOUND')
  const parsed = editorProjectSchema.safeParse(JSON.parse(editor.projectData))
  if (!parsed.success || parsed.data.timeline.length === 0) throw new ApiError('INVALID_PARAMS')
  const { project } = await authorizeEditorMedia(projectId, parsed.data)
  const task = await submitTask({
    userId: auth.session.user.id, projectId, episodeId: editor.episodeId,
    locale: resolveRequiredTaskLocale(request, body), requestId: getRequestId(request),
    type: TASK_TYPE.EDITOR_RENDER, targetType: 'VideoEditorProject', targetId: editor.id,
    payload: { projectData: project }, dedupeKey: `editor_render:${editor.id}`,
    billingInfo: { billable: false },
  })
  await prisma.videoEditorProject.update({ where: { id: editor.id }, data: { renderTaskId: task.taskId } })
  return NextResponse.json(task)
})

export const GET = apiHandler(async (request: NextRequest, context: { params: Promise<{ projectId: string }> }) => {
  const { projectId } = await context.params
  const auth = await requireProjectAuthLight(projectId)
  if (isErrorResponse(auth)) return auth
  const id = request.nextUrl.searchParams.get('id')
  if (!id) throw new ApiError('INVALID_PARAMS')
  const editor = await prisma.videoEditorProject.findFirst({ where: { id, episode: { novelPromotionProject: { projectId } } } })
  if (!editor) throw new ApiError('NOT_FOUND')
  const task = editor.renderTaskId ? await prisma.task.findUnique({ where: { id: editor.renderTaskId } }) : null
  const status = task?.status || editor.renderStatus || 'idle'
  const result = task?.result as { outputUrl?: string } | null
  return NextResponse.json({ status, progress: task?.progress || 0,
    outputUrl: status === 'completed' && result?.outputUrl ? getSignedUrl(result.outputUrl, 3600) : null,
    error: task?.errorMessage || null,
  })
})
