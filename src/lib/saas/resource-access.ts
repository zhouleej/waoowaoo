import { NextResponse } from 'next/server'
import { ApiError } from '@/lib/api-errors'
import {
  isErrorResponse,
  requireProjectAuthLight,
  type AuthSession,
} from '@/lib/api-auth'

type ProjectScopedResource = {
  userId: string
  projectId?: string | null
}

type ProjectAuthLightContext = {
  session: AuthSession
  project: {
    id: string
    userId: string
    organizationId?: string | null
    name: string
    [key: string]: unknown
  }
}

const USER_SCOPED_VIRTUAL_PROJECT_IDS = new Set(['home-ai-write'])

export async function requireProjectScopedResourceAccess(
  session: AuthSession,
  resource: ProjectScopedResource,
): Promise<ProjectAuthLightContext | null | NextResponse> {
  if (!resource.projectId || USER_SCOPED_VIRTUAL_PROJECT_IDS.has(resource.projectId)) {
    if (resource.userId !== session.user.id) {
      throw new ApiError('NOT_FOUND')
    }
    return null
  }

  const projectAuth = await requireProjectAuthLight(resource.projectId)
  if (isErrorResponse(projectAuth)) return projectAuth
  return projectAuth
}
