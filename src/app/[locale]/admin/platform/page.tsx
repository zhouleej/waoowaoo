'use client'
/* eslint-disable @typescript-eslint/no-explicit-any, no-restricted-syntax */

import { useCallback, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import { Link, useRouter } from '@/i18n/navigation'
import Navbar from '@/components/Navbar'
import { getPlatformErrorMessage } from '@/components/platform/errors'
import { PlatformAccessDenied, PlatformPageError } from '@/components/platform/PlatformPageState'
import { apiJson } from '@/lib/api-fetch'
import { usePlatformAdminCheck } from '@/hooks/common/usePlatformAdminCheck'

export default function PlatformAdminPage() {
  const { data: session, status } = useSession()
  const t = useTranslations('platform')
  const router = useRouter()
  const [stats, setStats] = useState<any>(null)
  const [statsLoading, setStatsLoading] = useState(true)
  const [statsError, setStatsError] = useState<string | null>(null)

  useEffect(() => {
    if (status === 'loading') return
    if (!session) {
      router.push({ pathname: '/auth/signin' })
    }
  }, [session, status, router])

  const {
    isPlatformAdmin,
    loading: platformAdminLoading,
    error: platformAdminError,
    retry: retryPlatformAdminCheck,
  } = usePlatformAdminCheck(status === 'authenticated' && Boolean(session))

  const fetchStats = useCallback(async () => {
    if (!isPlatformAdmin) return
    setStatsLoading(true)
    setStatsError(null)
    try {
      const data = await apiJson('/api/platform/stats')
      setStats(data)
    } catch (error) {
      setStats(null)
      setStatsError(getPlatformErrorMessage(error, t('loadFailed')))
    } finally {
      setStatsLoading(false)
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
        <h1 className="text-3xl font-bold text-[var(--glass-text-primary)] mb-8">{t('title')}</h1>

        {statsError ? (
          <PlatformPageError title={t('requestFailed')} message={statsError} retryLabel={t('retry')} onRetry={fetchStats} className="mb-8" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            {statsLoading ? (
              Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="glass-surface p-6 animate-pulse">
                  <div className="h-4 bg-[var(--glass-bg-muted)] rounded mb-3 w-2/3"></div>
                  <div className="h-8 bg-[var(--glass-bg-muted)] rounded w-1/2"></div>
                </div>
              ))
            ) : (
              <>
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
              </>
            )}
          </div>
        )}

        {/* Quick Actions */}
        <h2 className="text-xl font-semibold text-[var(--glass-text-primary)] mb-4">{t('quickActions')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          <Link href={{ pathname: '/admin/platform/organizations' }} className="glass-surface p-6 hover:brightness-110 transition-all group">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-[var(--glass-tone-info-bg)] flex items-center justify-center">
                <svg className="w-6 h-6 text-[var(--glass-tone-info-fg)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <div>
                <div className="font-semibold text-[var(--glass-text-primary)] group-hover:text-[var(--glass-tone-info-fg)]">{t('manageOrganizations')}</div>
                <div className="text-sm text-[var(--glass-text-secondary)]">{t('manageOrganizationsDesc')}</div>
              </div>
            </div>
          </Link>

          <Link href={{ pathname: '/admin/platform/users' }} className="glass-surface p-6 hover:brightness-110 transition-all group">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-[var(--glass-tone-warning-bg)] flex items-center justify-center">
                <svg className="w-6 h-6 text-[var(--glass-tone-warning-fg)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
              <div>
                <div className="font-semibold text-[var(--glass-text-primary)] group-hover:text-[var(--glass-tone-warning-fg)]">{t('manageUsers')}</div>
                <div className="text-sm text-[var(--glass-text-secondary)]">{t('manageUsersDesc')}</div>
              </div>
            </div>
          </Link>

          <Link href={{ pathname: '/admin/platform/billing' }} className="glass-surface p-6 hover:brightness-110 transition-all group">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-[var(--glass-tone-success-bg)] flex items-center justify-center">
                <svg className="w-6 h-6 text-[var(--glass-tone-success-fg)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14h6m-7 4h8m-9 3h10a2 2 0 002-2V7.5a2 2 0 00-.586-1.414l-3.5-3.5A2 2 0 0013.5 2H7a2 2 0 00-2 2v15a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <div className="font-semibold text-[var(--glass-text-primary)] group-hover:text-[var(--glass-tone-success-fg)]">{t('billingCenter')}</div>
                <div className="text-sm text-[var(--glass-text-secondary)]">{t('billingCenterDesc')}</div>
              </div>
            </div>
          </Link>

          <Link href={{ pathname: '/admin/platform/stats' }} className="glass-surface p-6 hover:brightness-110 transition-all group">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-[var(--glass-tone-info-bg)] flex items-center justify-center">
                <svg className="w-6 h-6 text-[var(--glass-tone-info-fg)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <div>
                <div className="font-semibold text-[var(--glass-text-primary)] group-hover:text-[var(--glass-tone-info-fg)]">{t('platformStats')}</div>
                <div className="text-sm text-[var(--glass-text-secondary)]">{t('platformStatsDesc')}</div>
              </div>
            </div>
          </Link>

          <Link href={{ pathname: '/admin/platform/config' }} className="glass-surface p-6 hover:brightness-110 transition-all group">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-[var(--glass-tone-success-bg)] flex items-center justify-center">
                <svg className="w-6 h-6 text-[var(--glass-tone-success-fg)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div>
                <div className="font-semibold text-[var(--glass-text-primary)] group-hover:text-[var(--glass-tone-success-fg)]">{t('systemConfig')}</div>
                <div className="text-sm text-[var(--glass-text-secondary)]">{t('systemConfigDesc')}</div>
              </div>
            </div>
          </Link>

          <Link href={{ pathname: '/admin/platform/audit' }} className="glass-surface p-6 hover:brightness-110 transition-all group">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-[var(--glass-tone-warning-bg)] flex items-center justify-center">
                <svg className="w-6 h-6 text-[var(--glass-tone-warning-fg)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                </svg>
              </div>
              <div>
                <div className="font-semibold text-[var(--glass-text-primary)] group-hover:text-[var(--glass-tone-warning-fg)]">{t('auditLog')}</div>
                <div className="text-sm text-[var(--glass-text-secondary)]">{t('auditLogDesc')}</div>
              </div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  )
}
