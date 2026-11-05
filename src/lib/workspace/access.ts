import { prisma } from '@/lib/prisma'
import { WorkspaceError as ApiError } from './errors'
import { setWorkspaceRuntime, workspaceRuntime } from './runtime'

export async function bindTeamWorkspace(organizationId: string, actorId: string, configVersionId?: string | null) {
  const member = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId: actorId } },
    include: { organization: true, user: { select: { isGlobalLocked: true } } },
  })
  if (!member || member.status !== 'active' || member.organization.status !== 'active' || member.user.isGlobalLocked) {
    throw new ApiError('FORBIDDEN', { message: 'Team membership is no longer active' })
  }
  setWorkspaceRuntime({
    actorId, organizationId, role: member.role,
    billingSource: member.organization.billingSource,
    configVersionId: configVersionId ?? member.organization.currentModelConfigId,
  })
  return member
}

export async function bindRequestWorkspace(actorId: string) {
  const runtime = workspaceRuntime()
  if (runtime.actorId === actorId) return
  const hint = runtime.hint
  if (!hint || hint === 'personal') {
    setWorkspaceRuntime({ actorId, organizationId: null })
    return
  }
  if (!hint.startsWith('team:') || !hint.slice(5)) throw new ApiError('INVALID_PARAMS', { message: 'Invalid workspace scope' })
  await bindTeamWorkspace(hint.slice(5), actorId)
}

export async function requireWorkspaceManager() {
  const runtime = workspaceRuntime()
  if (!runtime.organizationId) return
  const member = await bindTeamWorkspace(runtime.organizationId, runtime.actorId!, runtime.configVersionId)
  if (!['owner', 'admin'].includes(member.role)) throw new ApiError('FORBIDDEN', { message: 'Team administrator required' })
}

export async function readTeamConfig() {
  const runtime = workspaceRuntime()
  if (!runtime.organizationId || runtime.billingSource !== 'team_api_key') return null
  if (!runtime.configVersionId) throw new ApiError('INVALID_PARAMS', { message: '请先配置团队模型 / Configure team models first' })
  const config = await prisma.organizationModelConfigVersion.findUnique({ where: { id: runtime.configVersionId } })
  if (!config || config.organizationId !== runtime.organizationId) throw new ApiError('FORBIDDEN')
  return config
}

export async function teamPreference(): Promise<(Record<string, unknown> & { customModels: string; customProviders: string }) | null> {
  const runtime = workspaceRuntime()
  if (runtime.organizationId && runtime.billingSource === 'team_api_key' && !runtime.configVersionId) return { customModels: '[]', customProviders: '[]' }
  const config = await readTeamConfig()
  if (!config) return null
  return {
    ...config.defaults as Record<string, unknown>,
    customProviders: config.providers,
    customModels: config.models,
  }
}
