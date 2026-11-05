'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useQuery } from '@tanstack/react-query'
import { Link, usePathname } from '@/i18n/navigation'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { apiJson } from '@/lib/api-fetch'
import { AppIcon } from '@/components/ui/icons'

export default function WorkspaceSwitcher() {
  const t = useTranslations('teams')
  const pathname = usePathname()
  const { scope, memberships, switchScope } = useWorkspace()
  const [open, setOpen] = useState(false)
  const container = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const teamActive = scope.startsWith('team:') || pathname.startsWith('/teams')
  const invites = useQuery({
    queryKey: ['teams', 'invitations'],
    queryFn: () => apiJson<{ data: unknown[] }>('/api/user/team-invitations', { headers: { 'X-Workspace-Scope': 'personal' } }),
    staleTime: 15000,
  })

  useEffect(() => {
    if (!open) return
    const dismiss = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); trigger.current?.focus() }
    }
    document.addEventListener('mousedown', dismiss)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', dismiss)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  const tabClass = (active: boolean) => `inline-flex min-h-11 items-center justify-center gap-1.5 sm:gap-2 rounded-xl px-2 sm:px-4 text-xs sm:text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--glass-tone-info-fg)] ${active ? 'bg-[var(--glass-tone-info-bg)] text-[var(--glass-tone-info-fg)] shadow-sm' : 'text-[var(--glass-text-secondary)] hover:bg-[var(--glass-fill-hover)] hover:text-[var(--glass-text-primary)]'}`
  return <div className="relative flex items-center gap-1 rounded-2xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)] p-1">
    <button type="button" className={tabClass(!teamActive)} aria-current={!teamActive ? 'page' : undefined} onClick={() => void switchScope('personal')}>
      <AppIcon name="monitor" className="h-4 w-4" />{t('personalWorkspace')}
    </button>
    <div className="static sm:relative" ref={container}>
      <button ref={trigger} type="button" className={tabClass(teamActive)} aria-current={teamActive ? 'page' : undefined} aria-expanded={open} aria-controls="team-workspace-panel" onClick={() => setOpen(value => !value)}>
        <AppIcon name="usersRound" className="h-4 w-4" />{t('teamWorkspace')}
        {Boolean(invites.data?.data.length) && <span className="rounded-full bg-[var(--glass-tone-info-fg)] px-1.5 text-xs text-white">{invites.data!.data.length}</span>}
        <AppIcon name="chevronDown" className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div id="team-workspace-panel" aria-label={t('switchTeam')} className="glass-surface-modal absolute left-0 top-full z-[60] mt-3 w-[min(23rem,calc(100vw-2rem))] rounded-2xl border border-[var(--glass-stroke-base)] p-2 shadow-xl">
        <p className="px-3 py-2 text-xs font-medium text-[var(--glass-text-tertiary)]">{t('switchTeam')}</p>
        <div className="max-h-72 overflow-y-auto">
          {memberships.map(item => {
            const active = scope === `team:${item.organizationId}`
            return <div key={item.organizationId} className={`flex items-center gap-2 rounded-xl p-1 ${active ? 'bg-[var(--glass-tone-info-bg)]' : 'hover:bg-[var(--glass-fill-hover)]'}`}>
              <button type="button" className="flex min-w-0 flex-1 items-center gap-3 px-2 py-2 text-left" aria-label={`${t('enter')} ${item.organization.name}`} onClick={() => void switchScope(`team:${item.organizationId}`)}>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] text-sm font-semibold">{item.organization.name.slice(0, 1)}</span>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{item.organization.name}</span><span className="text-xs text-[var(--glass-text-tertiary)]">{t(`roles.${item.role}`)}{active ? ` · ${t('currentSpace')}` : ''}</span></span>
                {active && <AppIcon name="check" className="h-4 w-4 shrink-0 text-[var(--glass-tone-info-fg)]" />}
              </button>
              <Link href={{ pathname: `/teams/${item.organizationId}` }} onClick={() => setOpen(false)} className="shrink-0 rounded-lg px-3 py-2 text-xs font-medium text-[var(--glass-text-secondary)] hover:bg-[var(--glass-bg-surface)]">{t('manage')}</Link>
            </div>
          })}
          {!memberships.length && <p className="px-3 py-4 text-sm text-[var(--glass-text-secondary)]">{t('empty')}</p>}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1 border-t border-[var(--glass-stroke-base)] pt-2">
          <Link href={{ pathname: '/teams' }} onClick={() => setOpen(false)} className="rounded-lg px-3 py-2.5 text-center text-sm hover:bg-[var(--glass-fill-hover)]">{t('manageTeams')}</Link>
          <Link href={{ pathname: '/teams', query: { create: '1' } }} onClick={() => setOpen(false)} className="flex items-center justify-center gap-1 rounded-lg px-3 py-2.5 text-sm text-[var(--glass-tone-info-fg)] hover:bg-[var(--glass-fill-hover)]"><AppIcon name="plus" className="h-4 w-4" />{t('create')}</Link>
        </div>
      </div>}
    </div>
  </div>
}
