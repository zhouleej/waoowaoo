import { afterEach, describe, expect, it } from 'vitest'
import { reportedTokenUsage } from '@/lib/workspace/budget'
import { assertTeamCallsEnabled, assertTeamCreationEnabled } from '@/lib/workspace/availability'
import { withWorkspaceRuntime } from '@/lib/workspace/runtime'

describe('team budget usage and rollback gates', () => {
  const creation = process.env.TEAM_WORKSPACES_ENABLED
  const tasks = process.env.TEAM_TASKS_ENABLED
  afterEach(() => {
    if (creation === undefined) delete process.env.TEAM_WORKSPACES_ENABLED
    else process.env.TEAM_WORKSPACES_ENABLED = creation
    if (tasks === undefined) delete process.env.TEAM_TASKS_ENABLED
    else process.env.TEAM_TASKS_ENABLED = tasks
  })
  it('uses reported tokens instead of the conservative reservation estimate', () => {
    expect(reportedTokenUsage({ usage: { prompt_tokens: 200, completion_tokens: 35 } })).toBe(235)
    expect(reportedTokenUsage({ usage: { total_tokens: 500 } })).toBe(500)
    expect(reportedTokenUsage({ usage: { total_tokens: 0 } })).toBeUndefined()
  })
  it('keeps unconfirmed usage at its reserved estimate', () => {
    expect(reportedTokenUsage({ usage: null })).toBeUndefined()
    expect(reportedTokenUsage({ usage: { total_tokens: -1 } })).toBeUndefined()
    expect(reportedTokenUsage({ usage: { total_tokens: '123' } })).toBeUndefined()
  })
  it('blocks team creation during rollback', () => {
    process.env.TEAM_WORKSPACES_ENABLED = 'false'
    expect(() => assertTeamCreationEnabled()).toThrow('Team creation')
  })
  it('stops new team calls without disrupting personal or legacy platform billing', () => {
    process.env.TEAM_TASKS_ENABLED = 'false'
    withWorkspaceRuntime({ organizationId: 'team', billingSource: 'team_api_key' }, () => expect(() => assertTeamCallsEnabled()).toThrow('Team generation'))
    withWorkspaceRuntime({ billingSource: 'platform_balance' }, () => expect(() => assertTeamCallsEnabled()).not.toThrow())
    withWorkspaceRuntime({}, () => expect(() => assertTeamCallsEnabled()).not.toThrow())
  })
})
