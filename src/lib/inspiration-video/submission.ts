import { createHash } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { ApiError } from '@/lib/api-errors'

export function submissionCreationId(userId: string, workspaceId: string, submissionId: unknown) {
  if (submissionId == null) return undefined
  if (typeof submissionId !== 'string' || !/^[a-zA-Z0-9_-]{16,100}$/.test(submissionId)) throw new ApiError('INVALID_PARAMS', { field: 'submissionId' })
  return createHash('sha256').update(JSON.stringify([userId, workspaceId, submissionId])).digest('hex').slice(0, 36)
}

export async function findAcceptedSubmission(id: string) {
  const creation = await prisma.inspirationVideoCreation.findUnique({ where: { id } })
  if (!creation) return null
  // The task can already be queued even if linking taskId failed afterwards.
  const task = await prisma.task.findFirst({ where: { targetType: 'InspirationVideoCreation', targetId: id }, orderBy: { createdAt: 'desc' } })
  if (!task) throw new ApiError('CONFLICT', { message: '本次提交正在处理，请稍后刷新，不要重复生成', creationId: id })
  return { success: true, async: true, creationId: id, taskId: task.id, status: task.status, deduped: true }
}
