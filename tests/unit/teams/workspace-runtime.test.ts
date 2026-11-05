import { describe, expect, it } from 'vitest'
import { assetScopeData, assetScopeWhere, canAccessScopedAsset, withWorkspaceRuntime, workspaceRuntime } from '@/lib/workspace/runtime'
import { collectRevisions, parseRevisionHeader } from '@/lib/workspace/revisions'

describe('workspace isolation', () => {
  it('does not mix credentials or actors across interleaved requests', async () => {
    const result = await Promise.all(['team-a', 'team-b'].map(organizationId => withWorkspaceRuntime({ actorId: organizationId, organizationId, configVersionId: `${organizationId}-key` }, async () => {
      await new Promise(resolve => setTimeout(resolve, organizationId === 'team-a' ? 10 : 1))
      return { ...workspaceRuntime() }
    })))
    expect(result.map(item => item.configVersionId)).toEqual(['team-a-key', 'team-b-key'])
    expect(workspaceRuntime().organizationId).toBeUndefined()
  })

  it('excludes assets created for teams from their creator’s personal list', () => {
    withWorkspaceRuntime({ actorId: 'alice', organizationId: null }, () => {
      expect(assetScopeWhere('alice')).toEqual({ userId: 'alice', organizationId: null })
      expect(canAccessScopedAsset({ userId: 'alice', organizationId: 'team-a' }, 'alice')).toBe(false)
    })
  })

  it('shares a teammate’s asset but rejects another team or a private asset', () => {
    withWorkspaceRuntime({ actorId: 'alice', organizationId: 'team-a' }, () => {
      expect(assetScopeData('alice')).toEqual({ userId: 'alice', organizationId: 'team-a' })
      expect(canAccessScopedAsset({ userId: 'bob', organizationId: 'team-a' }, 'alice')).toBe(true)
      expect(canAccessScopedAsset({ userId: 'alice', organizationId: 'team-b' }, 'alice')).toBe(false)
      expect(canAccessScopedAsset({ userId: 'alice', organizationId: null }, 'alice')).toBe(false)
    })
  })
})

describe('optimistic edit revisions', () => {
  it('tracks nested records independently rather than assigning a project-wide revision', () => {
    const revisions = {}
    collectRevisions({ id: 'project', revision: 3, panels: [{ id: 'panel-a', revision: 0 }, { id: 'panel-b', revision: 7 }] }, revisions)
    expect(revisions).toEqual({ project: 3, 'panel-a': 0, 'panel-b': 7 })
  })
  it.each(['[]', '{"a":-1}', '{"a":1.5}', '{"a":"1"}', '{"a":null}', '{"__proto__":{}}'])('rejects malformed edit preconditions %s', value => {
    expect(() => parseRevisionHeader(value)).toThrow()
  })
  it('accepts revision zero for a newly created record', () => {
    expect(parseRevisionHeader('{"panel-a":0}')).toEqual({ 'panel-a': 0 })
  })
})
