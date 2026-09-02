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

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

export default function PlatformAuditPage() {
  const { data: session, status } = useSession()
  const t = useTranslations('platform')
  const router = useRouter()
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 1 })
  const [availableActions, setAvailableActions] = useState<string[]>([])
  const [selectedAction, setSelectedAction] = useState('')

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

  const fetchLogs = useCallback(async (page = 1) => {
    if (!isPlatformAdmin) return
    setLoading(true)
    setLoadError(null)
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' })
      if (selectedAction) params.set('action', selectedAction)
      const data = await apiJson(`/api/platform/audit-logs?${params.toString()}`) as any
      setLogs(Array.isArray(data) ? data : (data?.data || []))
      setPagination(data?.pagination || { page, limit: 20, total: 0, totalPages: 1 })
      setAvailableActions(Array.isArray(data?.filters?.actions) ? data.filters.actions : [])
    } catch (error) {
      setLogs([])
      setLoadError(getPlatformErrorMessage(error, t('loadFailed')))
    } finally {
      setLoading(false)
    }
  }, [isPlatformAdmin, selectedAction, t])

  useEffect(() => {
    void fetchLogs()
  }, [fetchLogs])

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
          <h1 className="text-3xl font-bold text-[var(--glass-text-primary)]">{t('auditLog')}</h1>
          <div className="flex items-center gap-3">
            <button onClick={() => void fetchLogs(1)} className="glass-btn-base px-4 py-2">{t('refresh')}</button>
            <Link href={{ pathname: '/admin/platform' }} className="glass-btn-base px-4 py-2">{t('back')}</Link>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <label className="text-sm text-[var(--glass-text-secondary)]" htmlFor="audit-action-filter">{t('action')}</label>
          <select
            id="audit-action-filter"
            value={selectedAction}
            onChange={(event) => setSelectedAction(event.target.value)}
            className="glass-input-base min-w-52 px-3 py-2"
          >
            <option value="">{t('allActions')}</option>
            {availableActions.map((action) => <option key={action} value={action}>{action}</option>)}
          </select>
        </div>

        <div className="glass-surface overflow-x-auto">
          {loadError ? (
            <PlatformPageError title={t('requestFailed')} message={loadError} retryLabel={t('retry')} onRetry={() => void fetchLogs(pagination.page)} />
          ) : loading ? (
            <div className="p-8 text-center text-[var(--glass-text-secondary)]">{t('loading')}</div>
          ) : logs.length === 0 ? (
            <div className="p-8 text-center text-[var(--glass-text-secondary)]">{t('noAuditLogs')}</div>
          ) : (
            <table className="w-full min-w-[960px]">
              <thead className="bg-[var(--glass-bg-muted)]">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[var(--glass-text-secondary)] uppercase tracking-wider">{t('time')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[var(--glass-text-secondary)] uppercase tracking-wider">{t('admin')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[var(--glass-text-secondary)] uppercase tracking-wider">{t('action')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[var(--glass-text-secondary)] uppercase tracking-wider">{t('targetType')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[var(--glass-text-secondary)] uppercase tracking-wider">{t('targetId')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[var(--glass-text-secondary)] uppercase tracking-wider">{t('details')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--glass-stroke-base)]">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-[var(--glass-bg-muted)]/50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--glass-text-secondary)]">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--glass-text-primary)]">{log.admin?.name || log.adminId}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 py-1 text-xs rounded-full bg-[var(--glass-tone-warning-bg)] text-[var(--glass-tone-warning-fg)]">
                        {log.action}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--glass-text-secondary)]">{log.targetType}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--glass-text-secondary)] font-mono text-xs">{log.targetId || '-'}</td>
                    <td className="px-6 py-4 text-sm text-[var(--glass-text-secondary)] max-w-xs truncate">
                      {log.details ? (typeof log.details === 'string' ? log.details : JSON.stringify(log.details)) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {!loadError && !loading && (
          <div className="mt-4 flex items-center justify-between gap-3">
            <span className="text-sm text-[var(--glass-text-secondary)]">
              {t('paginationSummary', { total: pagination.total, page: pagination.page, totalPages: pagination.totalPages })}
            </span>
            <div className="flex gap-2">
              <button
                className="glass-btn-base px-4 py-2 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={pagination.page <= 1}
                onClick={() => void fetchLogs(pagination.page - 1)}
              >
                {t('prevPage')}
              </button>
              <button
                className="glass-btn-base px-4 py-2 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => void fetchLogs(pagination.page + 1)}
              >
                {t('nextPage')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
