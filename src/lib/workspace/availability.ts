import { WorkspaceError } from './errors'
import { workspaceRuntime } from './runtime'

export function assertTeamCreationEnabled() {
  if (process.env.TEAM_WORKSPACES_ENABLED === 'false') throw new WorkspaceError('FORBIDDEN', { message: '团队创建暂未开放 / Team creation is temporarily disabled' })
}

export function assertTeamCallsEnabled() {
  if (workspaceRuntime().billingSource === 'team_api_key' && process.env.TEAM_TASKS_ENABLED === 'false') throw new WorkspaceError('FORBIDDEN', { message: '团队生成暂时停止 / Team generation is temporarily disabled' })
}
