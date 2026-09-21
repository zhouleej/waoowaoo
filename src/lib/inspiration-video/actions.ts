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
    if (!task) throw new ApiError('NOT_FOUND')
    if (task.status === 'canceled') return NextResponse.json({ success: true, cancelled: true })
    if (!['queued', 'processing'].includes(task.status)) throw new ApiError('CONFLICT', { message: '任务已完成或正在结算，无法取消' })
    const cancellation = await cancelTask(task.id)
    if (!cancellation.cancelled && cancellation.task?.status !== 'canceled') {
      throw new ApiError('CONFLICT', { message: '任务状态已变化，未能取消，请刷新后查看' })
    }
    if (cancellation.cancelled) await removeTaskJob(task.id).catch(() => false)
    return NextResponse.json({ success: true, cancelled: true })
  }
  if (active) throw new ApiError('CONFLICT', { message: '请先等待任务完成或取消任务' })
  if (body.action === 'delete') {
    await prisma.inspirationVideoCreation.delete({ where: { id: creation.id } })
    return NextResponse.json({ success: true })
  }
  if (creation.outputVideoKey) throw new ApiError('CONFLICT', { message: '已有生成结果，请复用参数创建新版本' })
  const previousPayload = task?.payload && typeof task.payload === 'object' && !Array.isArray(task.payload) ? task.payload : {}
  const previousOptions = previousPayload.generationOptions && typeof previousPayload.generationOptions === 'object' && !Array.isArray(previousPayload.generationOptions)
    ? previousPayload.generationOptions : null
  // Copy only generation inputs, never old run IDs, billing or orchestration state.
  const result = await submitTask({
    userId, projectId: workspace.projectId, locale: resolveRequiredTaskLocale(request, body), requestId: getRequestId(request),
    type: TASK_TYPE.VIDEO_PANEL, targetType: 'InspirationVideoCreation', targetId: creation.id,
    dedupeKey: `inspiration_video:${creation.id}`,
    payload: { videoModel: creation.modelKey, prompt: creation.prompt,
      ...(previousPayload.mobileCloudAssets ? { mobileCloudAssets: previousPayload.mobileCloudAssets } : {}),
      ...(previousPayload.generateThumbnailFromVideo === true ? { generateThumbnailFromVideo: true } : {}),
      generationOptions: {
      aspectRatio: creation.aspectRatio, resolution: creation.resolution, duration: creation.duration,
      generationMode: 'normal',
      ...(!previousOptions || typeof previousOptions.generateAudio === 'boolean' ? { generateAudio: creation.generateAudio } : {}),
    } },
  })
  await prisma.inspirationVideoCreation.update({ where: { id: creation.id }, data: { taskId: result.taskId } })
  return NextResponse.json(result)
}
