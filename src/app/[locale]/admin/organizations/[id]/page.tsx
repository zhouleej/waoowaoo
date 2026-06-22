'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import { useParams } from 'next/navigation'
import { useRouter } from '@/i18n/navigation'
import Navbar from '@/components/Navbar'
import { AppIcon } from '@/components/ui/icons'
import { Link } from '@/i18n/navigation'
import { apiFetch } from '@/lib/api-fetch'

interface OrgBalance { id: string; balance: number; frozenAmount: number; totalSpent: number }
interface Member { user: { id: string; name: string; email: string; image: string | null }; role: string; status: string; quota: number; joinedAt: string }
interface Organization { id: string; name: string; slug: string; createdAt: string; balance: OrgBalance; members: Member[] }

export default function OrganizationDetailPage() {
  const params = useParams()
  const orgId = params?.id as string
  const { data: session, status } = useSession()
  const router = useRouter()
  const t = useTranslations('organizations')
  const tc = useTranslations('common')
  const [org, setOrg] = useState<Organization | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'members' | 'billing'>('overview')

  useEffect(() => {
    if (status === 'loading') return
    if (!session) router.push({ pathname: '/auth/signin' })
  }, [session, status, router])

  const fetchOrg = useCallback(async () => {
    if (!orgId) return
    try {
      const res = await apiFetch('/api/organizations/' + orgId)
      if (res.ok) setOrg(await res.json())
    } catch {}
    finally { setLoading(false) }
  }, [orgId])

  useEffect(() => { if (session && orgId) void fetchOrg() }, [session, orgId, fetchOrg])

  const formatDate = (d: string) => new Date(new Date(d).getTime() + 8 * 60 * 60 * 1000).toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' })

  if (status === 'loading' || !session) return <div className="glass-page min-h-screen flex items-center justify-center"><div className="text-[var(--glass-text-secondary)]">{tc('loading')}</div></div>
  if (!org) return <div className="glass-page min-h-screen flex items-center justify-center"><div className="text-[var(--glass-text-secondary)]">{tc('loading')}</div></div>

  return (
    <div className="glass-page min-h-screen">
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-6">
          <Link href={{ pathname: '/admin/organizations' }} className="text-sm text-[var(--glass-tone-info-fg)] hover:underline flex items-center gap-1">
            <AppIcon name="chevronLeft" className="w-4 h-4" />{tc('back')}
          </Link>
        </div>
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[var(--glass-text-primary)] mb-2">{org.name}</h1>
          <p className="text-[var(--glass-text-secondary)] font-mono">{org.slug}</p>
        </div>
        
        {/* Tabs */}
        <div className="flex gap-1 mb-6 p-1 rounded-lg bg-[var(--glass-bg-muted)] w-fit">
          {(['overview', 'members', 'billing'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} className={'px-4 py-2 rounded-md text-sm font-medium transition-all ' + (activeTab === tab ? 'bg-[var(--glass-bg-surface)] text-[var(--glass-text-primary)] shadow-sm' : 'text-[var(--glass-text-secondary)] hover:text-[var(--glass-text-primary)]')}>
              {t(tab)}
            </button>
          ))}
        </div>

        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="glass-surface p-6">
              <div className="flex items-center gap-2 mb-2"><AppIcon name="coins" className="w-5 h-5 text-[var(--glass-tone-success-fg)]" /><span className="text-sm text-[var(--glass-text-secondary)]">{t('balance')}</span></div>
              <p className="text-2xl font-bold text-[var(--glass-text-primary)]">¥{org.balance?.balance?.toFixed(2) || '0.00'}</p>
            </div>
            <div className="glass-surface p-6">
              <div className="flex items-center gap-2 mb-2"><AppIcon name="usersRound" className="w-5 h-5 text-[var(--glass-tone-info-fg)]" /><span className="text-sm text-[var(--glass-text-secondary)]">{t('members')}</span></div>
              <p className="text-2xl font-bold text-[var(--glass-text-primary)]">{org.members?.length || 0}</p>
            </div>
            <div className="glass-surface p-6">
              <div className="flex items-center gap-2 mb-2"><AppIcon name="clock" className="w-5 h-5 text-[var(--glass-text-tertiary)]" /><span className="text-sm text-[var(--glass-text-secondary)]">{t('createdAt')}</span></div>
              <p className="text-lg font-medium text-[var(--glass-text-primary)]">{formatDate(org.createdAt)}</p>
            </div>
          </div>
        )}

        {activeTab === 'members' && (
          <div>
            <div className="flex justify-end mb-4">
              <Link href={'/admin/organizations/' + orgId + '/members'} className="glass-btn-base glass-btn-primary px-4 py-2 flex items-center gap-2">
                <AppIcon name="user" className="w-4 h-4" />{t('inviteMember')}
              </Link>
            </div>
            <div className="glass-surface overflow-hidden">
              <table className="w-full">
                <thead className="bg-[var(--glass-bg-muted)]">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-[var(--glass-text-secondary)]">{t('role')}</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-[var(--glass-text-secondary)]">{t('status')}</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-[var(--glass-text-secondary)]">{t('quota')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--glass-stroke-base)]">
                  {org.members?.map(m => (
                    <tr key={m.user.id} className="hover:bg-[var(--glass-bg-muted)]/50">
                      <td className="px-4 py-3">
                        <span className={'inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ' + (m.role === 'owner' ? 'bg-blue-500/20 text-blue-500' : m.role === 'admin' ? 'bg-purple-500/20 text-purple-500' : 'bg-gray-500/20 text-gray-500')}>
                          {t('roles.' + m.role)}
                        </span>
                      </td>
                      <td className="px-4 py-3"><span className={'text-sm ' + (m.status === 'active' ? 'text-[var(--glass-tone-success-fg)]' : 'text-[var(--glass-tone-danger-fg)]')}>{t('statuses.' + m.status)}</span></td>
                      <td className="px-4 py-3 text-sm text-[var(--glass-text-primary)]">¥{m.quota.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'billing' && (
          <div>
            <Link href={'/admin/organizations/' + orgId + '/billing'} className="glass-btn-base glass-btn-primary px-4 py-2 inline-flex items-center gap-2">
              <AppIcon name="coins" className="w-4 h-4" />{t('recharge')}
            </Link>
          </div>
        )}
      </main>
    </div>
  )
}