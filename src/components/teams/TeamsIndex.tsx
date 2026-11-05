'use client'

import { useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import Navbar from '@/components/Navbar'
import { Link } from '@/i18n/navigation'
import { apiJson } from '@/lib/api-fetch'
import { useWorkspace } from '@/contexts/WorkspaceContext'

type Team = { id: string; name: string; memberCount: number; currentUserRole: string }
type Invitation = { id: string; role: string; organization: { id: string; name: string }; invitedBy: { name: string } }
const personalHeaders = { 'X-Workspace-Scope': 'personal' }

export default function TeamsIndex() {
  const t = useTranslations('teams'), locale = useLocale()
  const { data: session, status } = useSession()
  const { switchScope } = useWorkspace()
  const client = useQueryClient()
  const [name, setName] = useState(''), [creating, setCreating] = useState(false), [error, setError] = useState('')
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('create') === '1') setCreating(true)
  }, [])
  const teams = useQuery({ queryKey: ['teams', 'list'], queryFn: () => apiJson<Team[]>('/api/organizations', { headers: personalHeaders }), enabled: Boolean(session) })
  const invitations = useQuery({ queryKey: ['teams', 'invitations'], queryFn: () => apiJson<{ data: Invitation[] }>('/api/user/team-invitations', { headers: personalHeaders }), enabled: Boolean(session) })
  const create = useMutation({ mutationFn: () => apiJson<Team>('/api/organizations', { method: 'POST', headers: { ...personalHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim(), billingSource: 'team_api_key' }) }), onSuccess: team => switchScope(`team:${team.id}`, `/${locale}/teams/${team.id}`), onError: failure => setError(failure.message) })
  const respond = useMutation({ mutationFn: ({ id, action }: { id: string; action: string }) => apiJson(`/api/user/team-invitations/${id}`, { method: 'POST', headers: { ...personalHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) }), onSuccess: async () => { await client.invalidateQueries({ queryKey: ['teams'] }) }, onError: failure => setError(failure.message) })

  return <div className="glass-page min-h-screen"><Navbar /><main className="max-w-6xl mx-auto px-5 py-12">
    <div className="flex flex-wrap items-end justify-between gap-6 mb-10"><div><p className="text-xs tracking-[.22em] uppercase text-[var(--glass-text-tertiary)] mb-3">Creative workspace</p><h1 className="text-3xl md:text-4xl font-semibold tracking-tight">{t('title')}</h1><p className="mt-3 text-[var(--glass-text-secondary)]">{t('subtitle')}</p></div><button className="glass-btn-base glass-btn-primary px-5 py-3" onClick={() => setCreating(true)}>{t('create')}</button></div>
    {status === 'unauthenticated' && <Link href={{ pathname: '/auth/signin' }} className="glass-btn-base glass-btn-primary px-5 py-3">{t('personal')}</Link>}
    {(error || teams.error || invitations.error) && <p role="alert" className="my-4 text-red-600">{error || teams.error?.message || invitations.error?.message}</p>}
    {Boolean(invitations.data?.data.length) && <section className="glass-surface p-6 mb-8"><h2 className="font-semibold text-lg mb-4">{t('pendingInvitations')}</h2>{invitations.data!.data.map(invite => <div key={invite.id} className="flex flex-wrap items-center justify-between gap-4 border-t border-[var(--glass-stroke-base)] py-5"><div><p className="font-semibold">{invite.organization.name} <span className="text-xs text-[var(--glass-text-secondary)] ml-2">{t(`roles.${invite.role}`)}</span></p><p className="text-sm mt-1 text-[var(--glass-text-secondary)]">{invite.invitedBy.name} · {t('inviteNotice')}</p></div><div className="flex gap-2"><button disabled={respond.isPending} className="glass-btn-base glass-btn-secondary px-4 py-2" onClick={() => respond.mutate({ id: invite.id, action: 'reject' })}>{t('reject')}</button><button disabled={respond.isPending} className="glass-btn-base glass-btn-primary px-4 py-2" onClick={() => respond.mutate({ id: invite.id, action: 'accept' })}>{t('accept')}</button></div></div>)}</section>}
    {teams.isLoading ? <p role="status">{t('loading')}</p> : <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">{teams.data?.map(team => <article key={team.id} className="glass-surface p-6 flex flex-col gap-5"><div className="flex justify-between items-start"><div className="w-12 h-12 rounded-xl bg-[var(--glass-bg-muted)] grid place-items-center text-xl font-semibold">{team.name.slice(0, 1)}</div><span className="text-xs rounded-full border border-[var(--glass-stroke-base)] px-3 py-1">{t(`roles.${team.currentUserRole}`)}</span></div><div><h2 className="text-xl font-semibold">{team.name}</h2><p className="text-sm text-[var(--glass-text-secondary)] mt-2">{team.memberCount} {t('memberCount')}</p></div><div className="mt-auto flex gap-3"><button className="glass-btn-base glass-btn-primary px-4 py-2 text-sm" onClick={() => void switchScope(`team:${team.id}`)}>{t('enter')}</button><Link href={{ pathname: `/teams/${team.id}` }} className="glass-btn-base glass-btn-secondary px-4 py-2 text-sm">{t('open')}</Link></div></article>)}</div>}
    {teams.data?.length === 0 && <div className="glass-surface py-20 px-6 text-center text-[var(--glass-text-secondary)]">{t('empty')}</div>}
    {creating && <div className="fixed inset-0 z-[100] bg-black/30 backdrop-blur-sm grid place-items-center px-4" onClick={() => !create.isPending && setCreating(false)}><form role="dialog" aria-modal="true" aria-labelledby="create-team-title" className="glass-surface p-8 w-full max-w-md" onClick={event => event.stopPropagation()} onSubmit={event => { event.preventDefault(); create.mutate() }}><h2 id="create-team-title" className="text-xl font-semibold">{t('create')}</h2><p className="text-sm text-[var(--glass-text-secondary)] mt-2 mb-6">{t('createHint')}</p><label className="block text-sm">{t('name')}<input autoFocus required maxLength={50} value={name} onChange={event => setName(event.target.value)} className="glass-input-base w-full mt-2 px-4 py-3" /></label><div className="mt-6 flex justify-end gap-3"><button type="button" className="glass-btn-base glass-btn-secondary px-4 py-2" onClick={() => setCreating(false)}>{t('cancel')}</button><button disabled={create.isPending || !name.trim()} className="glass-btn-base glass-btn-primary px-5 py-2">{create.isPending ? t('loading') : t('create')}</button></div></form></div>}
  </main></div>
}
