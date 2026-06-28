'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import { Link, useRouter } from '@/i18n/navigation'
import Navbar from '@/components/Navbar'
import { getPlatformErrorMessage } from '@/components/platform/errors'
import { PlatformAccessDenied, PlatformPageError } from '@/components/platform/PlatformPageState'
import { apiJson } from '@/lib/api-fetch'
import { usePlatformAdminCheck } from '@/hooks/common/usePlatformAdminCheck'

export default function PlatformStatsPage() {
  const { data: session, status } = useSession()
  const t = useTranslations('platform')
  const router = useRouter()
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const {
    isPlatformAdmin,
    loading: platformAdminLoading,
    error: platformAdminError,
    retry: retryPlatformAdminCheck,
  } = usePlatformAdminCheck(status === 'authenticated' && Boolean(session))

  useEffect(() => {
    if (status === 'loading') return
    if (!session) router.push({ pathname: '/auth/signin' })
  }, [session, status, router])

  const fetchStats = useCallback(async () => {
    if (!isPlatformAdmin) return
    setLoading(true)
    setLoadError(null)
    try {
      const data = await apiJson('/api/platform/stats')
      setStats(data)
    } catch (error) {
      setStats(null)
      setLoadError(getPlatformErrorMessage(error, t('loadFailed')))
    } finally {
      setLoading(false)
    }
  }, [isPlatformAdmin, t])

  useEffect(() => {
    void fetchStats()
  }, [fetchStats])

  if (status === 'loading' || !session || platformAdminLoading) {
    return (
      <div className="min-h-screen bg-[var(--glass-bg-root)]">
        <Navbar />
        <div className="flex items-center justify-center h-[calc(100vh-64px)]">
          <div className="animate-pulse text-[var(--glass-text-secondary)]">{t('loading')}</div>
        </div>
      </div>
    )
  }

  if (platformAdminError) {
    return (
      <div className="min-h-screen bg-[var(--glass-bg-root)]">
        <Navbar />
        <div className="mx-auto max-w-3xl px-4 py-16">
          <PlatformPageError
            title={t('platformAdminCheckFailed')}
            message={platformAdminError.message}
            retryLabel={t('retry')}
            onRetry={retryPlatformAdminCheck}
          />
        </div>
      </div>
    )
  }

  if (!isPlatformAdmin) {
    return (
      <div className="min-h-screen bg-[var(--glass-bg-root)]">
        <Navbar />
        <PlatformAccessDenied title={t('accessDeniedTitle')} message={t('noPermission')} />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--glass-bg-root)]">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-[var(--glass-text-primary)]">{t('platformStats')}</h1>
          <Link href={{ pathname: '/admin/platform' }} className="glass-btn-base px-4 py-2">{t('back')}</Link>
        </div>

        {loadError ? (
          <PlatformPageError title={t('requestFailed')} message={loadError} retryLabel={t('retry')} onRetry={fetchStats} />
        ) : loading ? (
          <div className="glass-surface p-8 text-center text-[var(--glass-text-secondary)]">{t('loading')}</div>
        ) : (
          <>
            {/* 概览卡片 */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              <div className="glass-surface p-6">
                <div className="text-sm text-[var(--glass-text-secondary)] mb-2">{t('totalOrganizations')}</div>
                <div className="text-3xl font-bold text-[var(--glass-text-primary)]">{stats?.totalOrganizations || 0}</div>
              </div>
              <div className="glass-surface p-6">
                <div className="text-sm text-[var(--glass-text-secondary)] mb-2">{t('totalUsers')}</div>
                <div className="text-3xl font-bold text-[var(--glass-text-primary)]">{stats?.totalUsers || 0}</div>
              </div>
              <div className="glass-surface p-6">
                <div className="text-sm text-[var(--glass-text-secondary)] mb-2">{t('totalRevenue')}</div>
                <div className="text-3xl font-bold text-[var(--glass-tone-success-fg)]">¥{stats?.totalSpent || '0.00'}</div>
              </div>
              <div className="glass-surface p-6">
                <div className="text-sm text-[var(--glass-text-secondary)] mb-2">{t('activeOrganizations')}</div>
                <div className="text-3xl font-bold text-[var(--glass-tone-info-fg)]">{stats?.activeOrganizations || 0}</div>
              </div>
            </div>

            {/* 组织消费排行 */}
            <div className="glass-surface overflow-hidden mb-8">
              <div className="px-6 py-4 border-b border-[var(--glass-stroke-base)]">
                <h2 className="text-lg font-semibold text-[var(--glass-text-primary)]">{t('orgSpendingRank')}</h2>
              </div>
              {stats?.organizationStats?.length > 0 ? (
                <table className="w-full">
                  <thead className="bg-[var(--glass-bg-muted)]">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-[var(--glass-text-secondary)] uppercase tracking-wider">{t('rank')}</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-[var(--glass-text-secondary)] uppercase tracking-wider">{t('orgName')}</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-[var(--glass-text-secondary)] uppercase tracking-wider">{t('totalSpent')}</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-[var(--glass-text-secondary)] uppercase tracking-wider">{t('memberCount')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--glass-stroke-base)]">
                    {stats.organizationStats.map((org: any, index: number) => (
                      <tr key={org.id} className="hover:bg-[var(--glass-bg-muted)]/50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-[var(--glass-text-primary)]">{index + 1}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--glass-text-secondary)]">{org.name}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--glass-tone-success-fg)]">¥{org.totalSpent?.toFixed(2) || '0.00'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--glass-text-secondary)]">{org.memberCount || 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="p-8 text-center text-[var(--glass-text-secondary)]">{t('noData')}</div>
              )}
            </div>

            {/* 用户消费排行 */}
            <div className="glass-surface overflow-hidden">
              <div className="px-6 py-4 border-b border-[var(--glass-stroke-base)]">
                <h2 className="text-lg font-semibold text-[var(--glass-text-primary)]">{t('userSpendingRank')}</h2>
              </div>
              {stats?.userStats?.length > 0 ? (
                <table className="w-full">
                  <thead className="bg-[var(--glass-bg-muted)]">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-[var(--glass-text-secondary)] uppercase tracking-wider">{t('rank')}</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-[var(--glass-text-secondary)] uppercase tracking-wider">{t('username')}</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-[var(--glass-text-secondary)] uppercase tracking-wider">{t('totalSpent')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--glass-stroke-base)]">
                    {stats.userStats.map((user: any, index: number) => (
                      <tr key={user.id} className="hover:bg-[var(--glass-bg-muted)]/50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-[var(--glass-text-primary)]">{index + 1}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--glass-text-secondary)]">{user.name}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--glass-tone-success-fg)]">¥{user.totalSpent?.toFixed(2) || '0.00'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="p-8 text-center text-[var(--glass-text-secondary)]">{t('noData')}</div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
