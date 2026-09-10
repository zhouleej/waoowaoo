import { NextRequest, NextResponse } from 'next/server'
import { ApiError, getRequestId } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import { submitTask } from '@/lib/task/submitter'
import { cancelTask } from '@/lib/task/service'
import { removeTaskJob } from '@/lib/task/queues'
import { TASK_TYPE } from '@/lib/task/types'
import { resolveRequiredTaskLocale } from '@/lib/task/resolve-locale'

export async function actOnCreation(request: NextRequest, userId: string, workspace: { id: string; projectId: string }) {
  const body = await request.json()
  if (typeof body.id !== 'string' || !['retry', 'cancel', 'delete'].includes(body.action)) throw new ApiError('INVALID_PARAMS')
  const creation = await prisma.inspirationVideoCreation.findFirst({ where: { id: body.id, workspaceId: workspace.id } })
  if (!creation) throw new ApiError('NOT_FOUND')
  const task = await prisma.task.findFirst({ where: { projectId: workspace.projectId, targetType: 'InspirationVideoCreation', targetId: creation.id }, orderBy: { createdAt: 'desc' } })
  const active = task && ['queued', 'processing', 'settling'].includes(task.status)
  if (body.action === 'cancel') {
    if (task && active) { await cancelTask(task.id); await removeTaskJob(task.id).catch(() => false) }
    return NextResponse.json({ success: true })
  }
  if (active) throw new ApiError('CONFLICT', { message: '请先等待任务完成或取消任务' })
  if (body.action === 'delete') {
    await prisma.inspirationVideoCreation.delete({ where: { id: creation.id } })
    return NextResponse.json({ success: true })
  }
  if (creation.outputVideoKey) throw new ApiError('CONFLICT', { message: '已有生成结果，请复用参数创建新版本' })
  const result = await submitTask({
    userId, projectId: workspace.projectId, locale: resolveRequiredTaskLocale(request, body), requestId: getRequestId(request),
    type: TASK_TYPE.VIDEO_PANEL, targetType: 'InspirationVideoCreation', targetId: creation.id,
    dedupeKey: `inspiration_video:${creation.id}`,
    payload: { videoModel: creation.modelKey, prompt: creation.prompt, generationOptions: {
      aspectRatio: creation.aspectRatio, resolution: creation.resolution, duration: creation.duration,
      generationMode: 'normal', generateAudio: creation.generateAudio,
    } },
  })
  await prisma.inspirationVideoCreation.update({ where: { id: creation.id }, data: { taskId: result.taskId } })
  return NextResponse.json(result)
}
