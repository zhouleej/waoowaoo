import { bindTeamWorkspace } from '@/lib/workspace/access'
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
  organizationId?: string | null
}

type ProjectAuthLightContext = {
  session: AuthSession
  project: {
    id: string
    userId: string | null
    organizationId?: string | null
    name: string
    [key: string]: unknown
  }
}

const USER_SCOPED_VIRTUAL_PROJECT_IDS = new Set(['home-ai-write', 'global-asset-hub', 'asset-hub'])

export async function requireProjectScopedResourceAccess(
  session: AuthSession,
  resource: ProjectScopedResource,
): Promise<ProjectAuthLightContext | null | NextResponse> {
  if (!resource.projectId || USER_SCOPED_VIRTUAL_PROJECT_IDS.has(resource.projectId)) {
    if (resource.organizationId) {
      await bindTeamWorkspace(resource.organizationId, session.user.id)
      return null
    }
    if (resource.userId !== session.user.id) {
      throw new ApiError('NOT_FOUND')
    }
    return null
  }

  const projectAuth = await requireProjectAuthLight(resource.projectId)
  if (isErrorResponse(projectAuth)) return projectAuth
  return projectAuth
}
