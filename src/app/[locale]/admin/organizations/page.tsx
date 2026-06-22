'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import Navbar from '@/components/Navbar'
import { AppIcon } from '@/components/ui/icons'
import { Link, useRouter } from '@/i18n/navigation'
import { apiFetch } from '@/lib/api-fetch'

interface OrgBalance {
  id: string
  balance: number
}

interface Organization {
  id: string
  name: string
  slug: string
  createdAt: string
  currentUserRole: string
  balance: OrgBalance
}

export default function OrganizationsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const t = useTranslations('organizations')
  const tc = useTranslations('common')
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [formData, setFormData] = useState({ name: '', slug: '' })
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (status === 'loading') return
    if (!session) router.push({ pathname: '/auth/signin' })
  }, [session, status, router])

  const fetchOrgs = useCallback(async () => {
    try {
      const res = await apiFetch('/api/organizations')
      if (res.ok) setOrgs(await res.json())
    } catch {}
    finally { setLoading(false) }
  }, [])

  useEffect(() => { if (session) void fetchOrgs() }, [session, fetchOrgs])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim() || !formData.slug.trim()) return
    setCreating(true)
    try {
      const res = await apiFetch('/api/organizations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData) })
      if (res.ok) { const newOrg = await res.json(); setShowModal(false); router.push({ pathname: '/admin/organizations/' + newOrg.id }) }
    } catch {}
    finally { setCreating(false) }
  }

  if (status === 'loading' || !session) return <div className="glass-page min-h-screen flex items-center justify-center"><div className="text-[var(--glass-text-secondary)]">{tc('loading')}</div></div>

  return (
    <div className="glass-page min-h-screen">
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-[var(--glass-text-primary)] mb-2">{t('title')}</h1>
            <p className="text-[var(--glass-text-secondary)]">{t('subtitle')}</p>
          </div>
          <button onClick={() => setShowModal(true)} className="glass-btn-base glass-btn-primary px-5 py-2.5 flex items-center gap-2">
            <AppIcon name="plus" className="w-5 h-5" />
            {t('createOrganization')}
          </button>
        </div>
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => <div key={i} className="glass-surface p-6 animate-pulse"><div className="h-5 bg-[var(--glass-bg-muted)] rounded mb-3 w-3/4" /></div>)}
          </div>
        ) : orgs.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-[var(--glass-bg-muted)] rounded-xl flex items-center justify-center mx-auto mb-4">
              <AppIcon name="folderCards" className="w-8 h-8 text-[var(--glass-text-tertiary)]" />
            </div>
            <h3 className="text-lg font-medium text-[var(--glass-text-primary)] mb-2">{t('noOrganizations')}</h3>
            <p className="text-[var(--glass-text-secondary)] mb-6">{t('noOrganizationsDesc')}</p>
            <button onClick={() => setShowModal(true)} className="glass-btn-base glass-btn-primary px-6 py-3">{t('createOrganization')}</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {orgs.map(org => (
              <Link key={org.id} href={{ pathname: '/admin/organizations/' + org.id }} className="glass-surface cursor-pointer group hover:border-[var(--glass-tone-info-fg)]/40 transition-all p-5">
                <h3 className="text-lg font-bold text-[var(--glass-text-primary)] mb-2 group-hover:text-[var(--glass-tone-info-fg)]">{org.name}</h3>
                <div className="text-sm text-[var(--glass-text-secondary)] font-mono mb-3">{org.slug}</div>
                <span className={'inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ' + (org.currentUserRole === 'owner' ? 'bg-blue-500/20 text-blue-500' : 'bg-gray-500/20 text-gray-500')}>
                  {t('roles.' + org.currentUserRole)}
                </span>
                {org.balance && (
                  <div className="mt-4 flex items-center gap-2 p-3 rounded-lg bg-[var(--glass-bg-muted)]">
                    <AppIcon name="coins" className="w-4 h-4 text-[var(--glass-tone-success-fg)]" />
                    <span className="text-sm font-semibold">¥{org.balance.balance.toFixed(2)}</span>
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
      </main>
      {showModal && (
        <div className="fixed inset-0 glass-overlay flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="glass-surface-modal p-6 w-full max-w-md">
            <h2 className="text-xl font-bold text-[var(--glass-text-primary)] mb-4">{t('createOrganization')}</h2>
            <form onSubmit={handleCreate}>
              <div className="mb-4">
                <label className="block mb-2">{t('organizationName')}</label>
                <input type="text" value={formData.name} onChange={e => setFormData(p => ({ ...p, name: e.target.value }))} className="glass-input-base w-full px-3 py-2" required />
              </div>
              <div className="mb-4">
                <label className="block mb-2">{t('organizationSlug')}</label>
                <input type="text" value={formData.slug} onChange={e => setFormData(p => ({ ...p, slug: e.target.value }))} className="glass-input-base w-full px-3 py-2 font-mono" required />
              </div>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setShowModal(false)} className="glass-btn-base glass-btn-secondary px-4 py-2">{tc('cancel')}</button>
                <button type="submit" className="glass-btn-base glass-btn-primary px-4 py-2" disabled={creating}>{creating ? t('creating') : t('create')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}