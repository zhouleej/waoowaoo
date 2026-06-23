'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import Navbar from '@/components/Navbar'
import { apiFetch } from '@/lib/api-fetch'

export default function PlatformAdminPage() {
  const { data: session, status } = useSession()
  const t = useTranslations('platform')
  const router = useRouter()
  const [stats, setStats] = useState<any>(null)

  useEffect(() => {
    if (status === 'loading') return
    if (!session) {
      router.push('/auth/signin')
    }
  }, [session, status, router])

  const isPlatformAdmin = (session?.user as any)?.isPlatformAdmin

  useEffect(() => {
    if (!isPlatformAdmin) return
    // 获取统计数据
    apiFetch('/api/platform/stats').then(setStats).catch(console.error)
  }, [isPlatformAdmin])

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
          <p className="text-[var(--glass-text-secondary)]">{t('noPermission') || 'You do not have permission to access this page.'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--glass-bg-root)]">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-bold text-[var(--glass-text-primary)] mb-8">{t('title') || 'Platform Administration'}</h1>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="glass-surface p-6">
            <div className="text-sm text-[var(--glass-text-secondary)] mb-2">{t('totalOrganizations') || 'Total Organizations'}</div>
            <div className="text-3xl font-bold text-[var(--glass-text-primary)]">{stats?.totalOrganizations || 0}</div>
          </div>
          <div className="glass-surface p-6">
            <div className="text-sm text-[var(--glass-text-secondary)] mb-2">{t('totalUsers') || 'Total Users'}</div>
            <div className="text-3xl font-bold text-[var(--glass-text-primary)]">{stats?.totalUsers || 0}</div>
          </div>
          <div className="glass-surface p-6">
            <div className="text-sm text-[var(--glass-text-secondary)] mb-2">{t('totalRevenue') || 'Total Revenue'}</div>
            <div className="text-3xl font-bold text-[var(--glass-tone-success-fg)]">¥{stats?.totalSpent || '0.00'}</div>
          </div>
          <div className="glass-surface p-6">
            <div className="text-sm text-[var(--glass-text-secondary)] mb-2">{t('activeOrganizations') || 'Active Organizations'}</div>
            <div className="text-3xl font-bold text-[var(--glass-tone-info-fg)]">{stats?.activeOrganizations || 0}</div>
          </div>
        </div>

        {/* Quick Actions */}
        <h2 className="text-xl font-semibold text-[var(--glass-text-primary)] mb-4">{t('quickActions') || 'Quick Actions'}</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <a href="/admin/platform/organizations" className="glass-surface p-6 hover:brightness-110 transition-all group">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-[var(--glass-tone-info-bg)] flex items-center justify-center">
                <svg className="w-6 h-6 text-[var(--glass-tone-info-fg)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <div>
                <div className="font-semibold text-[var(--glass-text-primary)] group-hover:text-[var(--glass-tone-info-fg)]">{t('manageOrganizations') || 'Manage Organizations'}</div>
                <div className="text-sm text-[var(--glass-text-secondary)]">{t('manageOrganizationsDesc') || 'View and manage all organizations'}</div>
              </div>
            </div>
          </a>

          <a href="/admin/platform/users" className="glass-surface p-6 hover:brightness-110 transition-all group">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-[var(--glass-tone-warning-bg)] flex items-center justify-center">
                <svg className="w-6 h-6 text-[var(--glass-tone-warning-fg)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
              <div>
                <div className="font-semibold text-[var(--glass-text-primary)] group-hover:text-[var(--glass-tone-warning-fg)]">{t('manageUsers') || 'Manage Users'}</div>
                <div className="text-sm text-[var(--glass-text-secondary)]">{t('manageUsersDesc') || 'View and manage all users'}</div>
              </div>
            </div>
          </a>

          <a href="/admin/platform/stats" className="glass-surface p-6 hover:brightness-110 transition-all group">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-[var(--glass-tone-info-bg)] flex items-center justify-center">
                <svg className="w-6 h-6 text-[var(--glass-tone-info-fg)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <div>
                <div className="font-semibold text-[var(--glass-text-primary)] group-hover:text-[var(--glass-tone-info-fg)]">平台统计</div>
                <div className="text-sm text-[var(--glass-text-secondary)]">查看平台总消费和排行</div>
              </div>
            </div>
          </a>

          <a href="/admin/platform/config" className="glass-surface p-6 hover:brightness-110 transition-all group">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-[var(--glass-tone-success-bg)] flex items-center justify-center">
                <svg className="w-6 h-6 text-[var(--glass-tone-success-fg)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div>
                <div className="font-semibold text-[var(--glass-text-primary)] group-hover:text-[var(--glass-tone-success-fg)]">{t('systemConfig') || 'System Config'}</div>
                <div className="text-sm text-[var(--glass-text-secondary)]">{t('systemConfigDesc') || 'Configure system settings'}</div>
              </div>
            </div>
          </a>

          <a href="/admin/platform/audit" className="glass-surface p-6 hover:brightness-110 transition-all group">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-[var(--glass-tone-warning-bg)] flex items-center justify-center">
                <svg className="w-6 h-6 text-[var(--glass-tone-warning-fg)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                </svg>
              </div>
              <div>
                <div className="font-semibold text-[var(--glass-text-primary)] group-hover:text-[var(--glass-tone-warning-fg)]">操作日志</div>
                <div className="text-sm text-[var(--glass-text-secondary)]">查看管理员操作记录</div>
              </div>
            </div>
          </a>
        </div>
      </div>
    </div>
  )
}