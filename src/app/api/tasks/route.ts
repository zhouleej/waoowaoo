import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiHandler } from '@/lib/api-errors'
import { requireProjectAuthLight, requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { queryTasks } from '@/lib/task/service'
import { type TaskStatus } from '@/lib/task/types'
import { normalizeTaskError } from '@/lib/errors/normalize'
import {
  invalidOrganizationIdResponse,
  readRequestedOrganizationId,
  resolveCurrentOrganization,
} from '@/lib/saas/current-organization'

function withTaskError(task: Awaited<ReturnType<typeof queryTasks>>[number]) {
  const error = normalizeTaskError(task.errorCode, task.errorMessage)
  return {
    ...task,
    error,
  }
}

export const GET = apiHandler(async (request: NextRequest) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  const searchParams = request.nextUrl.searchParams
  const projectId = searchParams.get('projectId') || undefined
  const targetType = searchParams.get('targetType') || undefined
  const targetId = searchParams.get('targetId') || undefined
  const status = searchParams.getAll('status')
  const type = searchParams.getAll('type')
  const limit = Number.parseInt(searchParams.get('limit') || '50', 10)
  let organizationId: string | null | undefined
  let taskUserId: string | undefined

  if (projectId) {
    const projectAuth = await requireProjectAuthLight(projectId)
    if (isErrorResponse(projectAuth)) return projectAuth
    organizationId = projectAuth.project.organizationId || null
  } else {
    let requestedOrganizationId: string | null
    try {
      requestedOrganizationId = readRequestedOrganizationId(searchParams.get('organizationId'))
    } catch (error) {
      return invalidOrganizationIdResponse(error)
    }
    const preference = requestedOrganizationId
      ? null
      : await prisma.userPreference.findUnique({
        where: { userId: session.user.id },
        select: { currentOrganizationId: true },
      })
    const organizationContext = await resolveCurrentOrganization(
      session.user.id,
      requestedOrganizationId,
      preference?.currentOrganizationId,
    )
    if ('error' in organizationContext) return organizationContext.error
    if (organizationContext.organizationId) {
      organizationId = organizationContext.organizationId
    } else {
      organizationId = null
      taskUserId = session.user.id
    }
  }

  const tasks = await queryTasks({
    userId: taskUserId,
    organizationId,
    projectId,
    targetType,
    targetId,
    status: status.length ? (status as TaskStatus[]) : undefined,
    type: type.length ? type : undefined,
    limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 200) : 50,
  })

  const filtered = tasks
    .map(withTaskError)
  return NextResponse.json({ tasks: filtered })
})
