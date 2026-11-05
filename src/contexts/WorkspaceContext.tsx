'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useLocale, useTranslations } from 'next-intl'
import { useQueryClient } from '@tanstack/react-query'
import { storeClientWorkspaceScope } from '@/lib/workspace/client-scope'

export type WorkspaceMembership = { organizationId: string; role: string; organization: { id: string; name: string } }
type WorkspaceContextValue = {
  scope: string
  memberships: WorkspaceMembership[]
  current: WorkspaceMembership | undefined
  switchScope: (scope: string, destination?: string) => Promise<void>
}
const WorkspaceContext = createContext<WorkspaceContextValue>({ scope: 'personal', memberships: [], current: undefined, switchScope: async () => {} })

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession()
  const locale = useLocale()
  const t = useTranslations('teams')
  const queryClient = useQueryClient()
  const [scope, setScope] = useState('personal')
  const [memberships, setMemberships] = useState<WorkspaceMembership[]>([])
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const userId = session?.user?.id

  useEffect(() => {
    if (status === 'loading') return
    if (!userId) { sessionStorage.removeItem('waoowaoo-workspace-scope'); setReady(true); return }
    let canceled = false
    void (async () => {
      try {
        const response = await fetch('/api/organizations/current', { headers: { 'X-Workspace-Scope': 'personal' } })
        if (!response.ok) throw new Error(t('loadFailed'))
        const payload = await response.json()
        const list: WorkspaceMembership[] = payload.memberships
        let selected = sessionStorage.getItem(`waoowaoo-workspace:${userId}`)
          ?? (payload.currentOrganization ? `team:${payload.currentOrganization.organizationId}` : 'personal')
        const projectId = window.location.pathname.match(/\/workspace\/([a-z0-9-]{20,})\/?$/)?.[1]
        if (projectId) {
          const projectResponse = await fetch(`/api/projects/${projectId}`, { headers: { 'X-Workspace-Scope': 'personal' } })
          if (projectResponse.ok) {
            const { project } = await projectResponse.json()
            selected = project.organizationId ? `team:${project.organizationId}` : 'personal'
          }
        }
        if (selected !== 'personal' && !list.some(item => `team:${item.organizationId}` === selected)) selected = 'personal'
        if (!canceled) {
          storeClientWorkspaceScope(userId, selected)
          setScope(selected); setMemberships(list); setReady(true)
        }
      } catch (failure) { if (!canceled) setError(failure instanceof Error ? failure.message : t('loadFailed')) }
    })()
    return () => { canceled = true }
  }, [userId, status, t])

  const switchScope = useCallback(async (next: string, destination?: string) => {
    if (!userId) return
    storeClientWorkspaceScope(userId, next)
    await queryClient.cancelQueries()
    queryClient.clear()
    // Full navigation also closes every EventSource and clears component drafts.
    await fetch('/api/organizations/current', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Workspace-Scope': 'personal' },
      body: JSON.stringify({ organizationId: next === 'personal' ? null : next.slice(5) }),
    }).catch(() => undefined)
    window.location.assign(destination ?? `/${locale}/workspace`)
  }, [userId, queryClient, locale])

  if (status === 'authenticated' && !ready) return <div className="glass-page min-h-screen grid place-items-center"><div role="status">{error || t('loading')}{error && <button className="glass-btn-base glass-btn-secondary ml-4 px-4 py-2" onClick={() => window.location.reload()}>{t('retry')}</button>}</div></div>
  return <WorkspaceContext.Provider value={{ scope, memberships, current: memberships.find(item => `team:${item.organizationId}` === scope), switchScope }}>{children}</WorkspaceContext.Provider>
}

export function useWorkspace() { return useContext(WorkspaceContext) }
