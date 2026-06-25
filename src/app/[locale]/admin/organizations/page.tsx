'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import Navbar from '@/components/Navbar'
import { AppIcon } from '@/components/ui/icons'
import { Link, useRouter } from '@/i18n/navigation'
import { apiFetch } from '@/lib/api-fetch'

interface OrgBalance {
  id: string
  balance: number
  frozenAmount: number
  totalSpent: number
}

interface Organization {
  id: string
  name: string
  slug: string
  createdAt: string
  currentUserRole: string
  balance: OrgBalance
  memberCount: number
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\u4e00-\u9fff-]/g, '')
    .replace(/^-+|-+$/g, '')
}

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export default function OrganizationsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const t = useTranslations('organizations')
  const tc = useTranslations('common')
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [formData, setFormData] = useState({ name: '', slug: '' })
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false)
  const [formErrors, setFormErrors] = useState<{ name?: string; slug?: string }>({})
  const [creating, setCreating] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

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

  const filteredOrgs = useMemo(() => {
    if (!searchQuery.trim()) return orgs
    const q = searchQuery.trim().toLowerCase()
    return orgs.filter(org => org.name.toLowerCase().includes(q))
  }, [orgs, searchQuery])

  const formatDate = (d: string) => new Date(d).toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' })

  const validateForm = (): boolean => {
    const errors: { name?: string; slug?: string } = {}
    if (!formData.name.trim()) {
      errors.name = t('nameRequired')
    }
    if (!formData.slug.trim()) {
      errors.slug = t('slugRequired')
    } else if (!SLUG_REGEX.test(formData.slug)) {
      errors.slug = t('slugValidation')
    }
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateForm()) return
    setCreating(true)
    try {
      const res = await apiFetch('/api/organizations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: formData.name.trim(), slug: formData.slug.trim() }) })
      if (res.ok) { const newOrg = await res.json(); setShowModal(false); setFormData({ name: '', slug: '' }); setSlugManuallyEdited(false); setFormErrors({}); router.push({ pathname: '/admin/organizations/' + newOrg.id }) }
    } catch {}
    finally { setCreating(false) }
  }

  const handleNameChange = (value: string) => {
    setFormData(prev => {
      const next = { ...prev, name: value }
      if (!slugManuallyEdited) {
        next.slug = generateSlug(value)
      }
      return next
    })
    if (formErrors.name) setFormErrors(prev => ({ ...prev, name: undefined }))
  }

  const handleSlugChange = (value: string) => {
    setSlugManuallyEdited(true)
    const sanitized = value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    setFormData(prev => ({ ...prev, slug: sanitized }))
    if (formErrors.slug) setFormErrors(prev => ({ ...prev, slug: undefined }))
  }

  const openModal = () => {
    setFormData({ name: '', slug: '' })
    setSlugManuallyEdited(false)
    setFormErrors({})
    setShowModal(true)
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
          <button onClick={openModal} className="glass-btn-base glass-btn-primary px-5 py-2.5 flex items-center gap-2">
            <AppIcon name="plus" className="w-5 h-5" />
            {t('createOrganization')}
          </button>
        </div>

        {!loading && orgs.length > 0 && (
          <div className="mb-6">
            <div className="relative max-w-sm">
              <AppIcon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--glass-text-tertiary)]" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') e.preventDefault() }}
                placeholder={t('searchPlaceholder')}
                className="glass-input-base w-full pl-10 pr-4 py-2"
              />
            </div>
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="glass-surface p-6 animate-pulse">
                <div className="h-5 bg-[var(--glass-bg-muted)] rounded mb-3 w-3/4" />
                <div className="h-4 bg-[var(--glass-bg-muted)] rounded mb-3 w-1/2" />
                <div className="h-3 bg-[var(--glass-bg-muted)] rounded w-1/3" />
              </div>
            ))}
          </div>
        ) : orgs.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-20 h-20 bg-[var(--glass-bg-muted)] rounded-2xl flex items-center justify-center mx-auto mb-4">
              <AppIcon name="folderCards" className="w-10 h-10 text-[var(--glass-text-tertiary)]" />
            </div>
            <h3 className="text-lg font-medium text-[var(--glass-text-primary)] mb-2">{t('noOrganizations')}</h3>
            <p className="text-[var(--glass-text-secondary)] mb-6 max-w-sm mx-auto">{t('noOrganizationsDesc')}</p>
            <button onClick={openModal} className="glass-btn-base glass-btn-primary px-6 py-3 flex items-center gap-2 mx-auto">
              <AppIcon name="plus" className="w-5 h-5" />
              {t('createOrganization')}
            </button>
          </div>
        ) : filteredOrgs.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-[var(--glass-bg-muted)] rounded-xl flex items-center justify-center mx-auto mb-4">
              <AppIcon name="search" className="w-8 h-8 text-[var(--glass-text-tertiary)]" />
            </div>
            <h3 className="text-lg font-medium text-[var(--glass-text-primary)] mb-2">{t('noSearchResults')}</h3>
            <p className="text-[var(--glass-text-secondary)]">{t('noOrganizationsDesc')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredOrgs.map(org => (
              <Link key={org.id} href={{ pathname: '/admin/organizations/' + org.id }} className="glass-surface cursor-pointer group hover:border-[var(--glass-tone-info-fg)]/40 transition-all p-5 flex flex-col gap-3">
                <div>
                  <h3 className="text-lg font-bold text-[var(--glass-text-primary)] mb-1 group-hover:text-[var(--glass-tone-info-fg)] transition-colors">{org.name}</h3>
                  <div className="text-sm text-[var(--glass-text-tertiary)] font-mono">{org.slug}</div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={'inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ' + (org.currentUserRole === 'owner' ? 'bg-blue-500/20 text-blue-500' : 'bg-gray-500/20 text-gray-500')}>
                    {t('roles.' + org.currentUserRole)}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-sm text-[var(--glass-text-secondary)] mt-auto pt-2 border-t border-[var(--glass-stroke-base)]">
                  <span className="flex items-center gap-1.5">
                    <AppIcon name="usersRound" className="w-3.5 h-3.5 text-[var(--glass-text-tertiary)]" />
                    {t('memberCount', { count: org.memberCount ?? 0 })}
                  </span>
                  {org.balance && (
                    <span className="flex items-center gap-1.5">
                      <AppIcon name="coins" className="w-3.5 h-3.5 text-[var(--glass-tone-success-fg)]" />
                      ¥{org.balance.balance.toFixed(2)}
                    </span>
                  )}
                  <span className="flex items-center gap-1.5 ml-auto">
                    <AppIcon name="clock" className="w-3.5 h-3.5 text-[var(--glass-text-tertiary)]" />
                    {formatDate(org.createdAt)}
                  </span>
                </div>
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
                <label className="block mb-2 text-sm font-medium text-[var(--glass-text-secondary)]">{t('organizationName')}</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => handleNameChange(e.target.value)}
                  placeholder={t('organizationNamePlaceholder')}
                  className={'glass-input-base w-full px-3 py-2' + (formErrors.name ? ' aria-invalid' : '')}
                />
                {formErrors.name && <p className="mt-1 text-xs text-red-400">{formErrors.name}</p>}
              </div>
              <div className="mb-4">
                <label className="block mb-2 text-sm font-medium text-[var(--glass-text-secondary)]">{t('organizationSlug')}</label>
                <input
                  type="text"
                  value={formData.slug}
                  onChange={e => handleSlugChange(e.target.value)}
                  placeholder={t('organizationSlugPlaceholder')}
                  className={'glass-input-base w-full px-3 py-2 font-mono' + (formErrors.slug ? ' aria-invalid' : '')}
                />
                <p className="mt-1 text-xs text-[var(--glass-text-tertiary)]">{t('slugHelp')}</p>
                {formErrors.slug && <p className="mt-1 text-xs text-red-400">{formErrors.slug}</p>}
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
