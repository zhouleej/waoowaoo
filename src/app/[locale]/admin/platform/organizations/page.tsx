'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import Navbar from '@/components/Navbar'
import { apiFetch } from '@/lib/api-fetch'

export default function PlatformOrganizationsPage() {
  const { data: session, status } = useSession()
  const t = useTranslations('platform')
  const router = useRouter()
  const [organizations, setOrganizations] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const isPlatformAdmin = (session?.user as any)?.isPlatformAdmin

  useEffect(() => {
    if (status === 'loading') return
    if (!session) router.push('/auth/signin')
  }, [session, status, router])

  useEffect(() => {
    if (!isPlatformAdmin) return
    apiFetch('/api/platform/organizations')
      .then(res => res.json())
      .then(data => setOrganizations(Array.isArray(data) ? data : (data?.data || [])))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [isPlatformAdmin])

  const handleDisable = async (orgId: string) => {
    if (!confirm(t('confirmDisable') || 'Are you sure you want to disable this organization?')) return
    try {
      await apiFetch(`/api/platform/organizations/${orgId}/disable`, { method: 'POST' })
      setOrganizations(orgs => orgs.map(o => o.id === orgId ? { ...o, status: 'disabled' } : o))
    } catch (e) {
      console.error(e)
      alert(t('disableFailed') || 'Failed to disable organization')
    }
  }

  const handleEnable = async (orgId: string) => {
    try {
      await apiFetch(`/api/platform/organizations/${orgId}/enable`, { method: 'POST' })
      setOrganizations(orgs => orgs.map(o => o.id === orgId ? { ...o, status: 'active' } : o))
    } catch (e) {
      console.error(e)
      alert(t('enableFailed') || 'Failed to enable organization')
    }
  }

  if (status === 'loading' || !session) {
    return (
      <div className="min-h-screen bg-[var(--glass-bg-root)]">
        <Navbar />
        <div className="flex items-center justify-center h-[calc(100vh-64px)]">
          <div className="animate-pulse text-[var(--glass-text-secondary)]">{t('loading') || 'Loading...'}</div>
        </div>
      </div>
    )
  }

  if (!isPlatformAdmin) {
    return (
      <div className="min-h-screen bg-[var(--glass-bg-root)]">
        <Navbar />
        <div className="flex flex-col items-center justify-center h-[calc(100vh-64px)]">
          <h1 className="text-2xl font-bold text-[var(--glass-text-primary)] mb-4">403 - Access Denied</h1>
          <p className="text-[var(--glass-text-secondary)]">You do not have permission to access this page.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--glass-bg-root)]">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-[var(--glass-text-primary)]">{t('organizations') || 'Organizations'}</h1>
          <a href="/admin/platform" className="glass-btn-base px-4 py-2">{t('back') || 'Back'}</a>
        </div>

        <div className="glass-surface overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-[var(--glass-text-secondary)]">{t('loading') || 'Loading...'}</div>
          ) : organizations.length === 0 ? (
            <div className="p-8 text-center text-[var(--glass-text-secondary)]">{t('noOrganizations') || 'No organizations found'}</div>
          ) : (
            <table className="w-full">
              <thead className="bg-[var(--glass-bg-muted)]">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[var(--glass-text-secondary)] uppercase tracking-wider">{t('name') || 'Name'}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[var(--glass-text-secondary)] uppercase tracking-wider">Slug</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[var(--glass-text-secondary)] uppercase tracking-wider">{t('status') || 'Status'}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[var(--glass-text-secondary)] uppercase tracking-wider">{t('members') || 'Members'}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[var(--glass-text-secondary)] uppercase tracking-wider">{t('balance') || 'Balance'}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[var(--glass-text-secondary)] uppercase tracking-wider">{t('createdAt') || 'Created'}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[var(--glass-text-secondary)] uppercase tracking-wider">{t('actions') || 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--glass-stroke-base)]">
                {organizations.map((org) => (
                  <tr key={org.id} className="hover:bg-[var(--glass-bg-muted)]/50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-[var(--glass-text-primary)]">{org.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--glass-text-secondary)]">{org.slug}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        org.status === 'active' 
                          ? 'bg-[var(--glass-tone-success-bg)] text-[var(--glass-tone-success-fg)]' 
                          : 'bg-[var(--glass-tone-danger-bg)] text-[var(--glass-tone-danger-fg)]'
                      }`}>
                        {org.status === 'active' ? (t('active') || 'Active') : (t('disabled') || 'Disabled')}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--glass-text-secondary)]">{org.members?.length || 0}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--glass-text-secondary)]">¥{org.balance?.balance?.toFixed(2) || '0.00'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--glass-text-secondary)]">
                      {new Date(org.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {org.status === 'active' ? (
                        <button
                          onClick={() => handleDisable(org.id)}
                          className="text-sm text-[var(--glass-tone-danger-fg)] hover:underline"
                        >
                          {t('disable') || 'Disable'}
                        </button>
                      ) : (
                        <button
                          onClick={() => handleEnable(org.id)}
                          className="text-sm text-[var(--glass-tone-success-fg)] hover:underline"
                        >
                          {t('enable') || 'Enable'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}