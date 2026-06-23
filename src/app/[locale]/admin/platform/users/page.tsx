'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import Navbar from '@/components/Navbar'
import { apiFetch } from '@/lib/api-fetch'

export default function PlatformUsersPage() {
  const { data: session, status } = useSession()
  const t = useTranslations('platform')
  const router = useRouter()
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const isPlatformAdmin = (session?.user as any)?.isPlatformAdmin

  useEffect(() => {
    if (status === 'loading') return
    if (!session) router.push('/auth/signin')
  }, [session, status, router])

  useEffect(() => {
    if (!isPlatformAdmin) return
    apiFetch('/api/platform/users')
      .then(res => res.json())
      .then(setUsers)
      .catch(console.error)
      .finally(() => setLoading(false))
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
          <h1 className="text-3xl font-bold text-[var(--glass-text-primary)]">{t('users') || 'Users'}</h1>
          <a href="/admin/platform" className="glass-btn-base px-4 py-2">{t('back') || 'Back'}</a>
        </div>

        <div className="glass-surface overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-[var(--glass-text-secondary)]">{t('loading') || 'Loading...'}</div>
          ) : users.length === 0 ? (
            <div className="p-8 text-center text-[var(--glass-text-secondary)]">{t('noUsers') || 'No users found'}</div>
          ) : (
            <table className="w-full">
              <thead className="bg-[var(--glass-bg-muted)]">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[var(--glass-text-secondary)] uppercase tracking-wider">{t('username') || 'Username'}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[var(--glass-text-secondary)] uppercase tracking-wider">{t('email') || 'Email'}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[var(--glass-text-secondary)] uppercase tracking-wider">{t('role') || 'Role'}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[var(--glass-text-secondary)] uppercase tracking-wider">{t('status') || 'Status'}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[var(--glass-text-secondary)] uppercase tracking-wider">{t('createdAt') || 'Created'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--glass-stroke-base)]">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-[var(--glass-bg-muted)]/50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-[var(--glass-text-primary)]">
                      {user.name}
                      {user.isPlatformAdmin && (
                        <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-[var(--glass-tone-warning-bg)] text-[var(--glass-tone-warning-fg)]">
                          Admin
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--glass-text-secondary)]">{user.email || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--glass-text-secondary)]">
                      {user.isPlatformAdmin ? (t('platformAdmin') || 'Platform Admin') : (t('user') || 'User')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {user.isGlobalLocked ? (
                        <span className="px-2 py-1 text-xs rounded-full bg-[var(--glass-tone-danger-bg)] text-[var(--glass-tone-danger-fg)]">
                          {t('locked') || 'Locked'}
                        </span>
                      ) : (
                        <span className="px-2 py-1 text-xs rounded-full bg-[var(--glass-tone-success-bg)] text-[var(--glass-tone-success-fg)]">
                          {t('normal') || 'Normal'}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--glass-text-secondary)]">
                      {new Date(user.createdAt).toLocaleDateString()}
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