'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import { Link, useRouter } from '@/i18n/navigation'
import Navbar from '@/components/Navbar'
import ConfirmDialog from '@/components/ConfirmDialog'
import { getPlatformErrorMessage } from '@/components/platform/errors'
import { PlatformAccessDenied, PlatformPageError } from '@/components/platform/PlatformPageState'
import { apiJson } from '@/lib/api-fetch'
import { usePlatformAdminCheck } from '@/hooks/common/usePlatformAdminCheck'
import { isSensitiveConfigKey, maskConfigValue } from '@/lib/platform/validation'

export default function PlatformConfigPage() {
  const { data: session, status } = useSession()
  const t = useTranslations('platform')
  const router = useRouter()
  const [configs, setConfigs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [newConfig, setNewConfig] = useState({ key: '', value: '', description: '' })
  const [creating, setCreating] = useState(false)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [revealedSensitiveKeys, setRevealedSensitiveKeys] = useState<Set<string>>(() => new Set())

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

  const fetchConfigs = useCallback(async () => {
    if (!isPlatformAdmin) return
    setLoading(true)
    setLoadError(null)
    try {
      const data = await apiJson('/api/platform/config')
      setConfigs(Array.isArray(data) ? data : ((data as any)?.data || []))
    } catch (error) {
      setConfigs([])
      setLoadError(getPlatformErrorMessage(error, t('loadFailed')))
    } finally {
      setLoading(false)
    }
  }, [isPlatformAdmin, t])

  useEffect(() => {
    void fetchConfigs()
  }, [fetchConfigs])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newConfig.key.trim() || !newConfig.value.trim()) return
    setCreating(true)
    try {
      await apiJson('/api/platform/config', {
        method: 'POST',
        body: JSON.stringify(newConfig),
      })
      setShowModal(false)
      setNewConfig({ key: '', value: '', description: '' })
      await fetchConfigs()
    } catch (error) {
      setLoadError(getPlatformErrorMessage(error, t('saveFailed')))
      setShowModal(true)
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTargetId) return
    setDeleting(true)
    try {
      await apiJson(`/api/platform/config/${deleteTargetId}`, { method: 'DELETE' })
      setDeleteTargetId(null)
      await fetchConfigs()
    } catch (error) {
      setLoadError(getPlatformErrorMessage(error, t('deleteFailed')))
      setDeleteTargetId(deleteTargetId)
    } finally {
      setDeleting(false)
    }
  }

  const handleSave = async (key: string) => {
    try {
      await apiJson('/api/platform/config', {
        method: 'PATCH',
        body: JSON.stringify({ key, value: editValue }),
      })
      setConfigs(configs.map(c => c.key === key ? { ...c, value: editValue } : c))
      setEditingKey(null)
    } catch (error) {
      setLoadError(getPlatformErrorMessage(error, t('saveFailed')))
      setEditingKey(key)
    }
  }

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
          <h1 className="text-3xl font-bold text-[var(--glass-text-primary)]">{t('systemConfig')}</h1>
          <div className="flex gap-3">
            <button onClick={() => setShowModal(true)} className="glass-btn-base glass-btn-primary px-4 py-2">{t('createConfig')}</button>
            <Link href={{ pathname: '/admin/platform' }} className="glass-btn-base px-4 py-2">{t('back')}</Link>
          </div>
        </div>

        <div className="glass-surface overflow-hidden">
          {loadError ? (
            <PlatformPageError title={t('requestFailed')} message={loadError} retryLabel={t('retry')} onRetry={fetchConfigs} />
          ) : loading ? (
            <div className="p-8 text-center text-[var(--glass-text-secondary)]">{t('loading')}</div>
          ) : configs.length === 0 ? (
            <div className="p-8 text-center text-[var(--glass-text-secondary)]">{t('noConfigItems')}</div>
          ) : (
            <table className="w-full">
              <thead className="bg-[var(--glass-bg-muted)]">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[var(--glass-text-secondary)] uppercase tracking-wider">{t('configKey')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[var(--glass-text-secondary)] uppercase tracking-wider">{t('value')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[var(--glass-text-secondary)] uppercase tracking-wider">{t('description')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[var(--glass-text-secondary)] uppercase tracking-wider">{t('updatedAt')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[var(--glass-text-secondary)] uppercase tracking-wider">{t('actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--glass-stroke-base)]">
                {configs.map((config) => {
                  const sensitive = isSensitiveConfigKey(config.key)
                  const revealed = revealedSensitiveKeys.has(config.key)
                  return (
                  <tr key={config.id} className="hover:bg-[var(--glass-bg-muted)]/50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-[var(--glass-text-primary)]">{config.key}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--glass-text-secondary)]">
                      {editingKey === config.key ? (
                        <input
                          type={sensitive && !revealed ? 'password' : 'text'}
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="glass-input w-full"
                        />
                      ) : (
                        <span className="max-w-xs truncate block" title={sensitive && !revealed ? undefined : config.value}>
                          {sensitive && !revealed ? maskConfigValue(config.value) : config.value}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--glass-text-secondary)]">{config.description || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--glass-text-secondary)]">
                      {config.updatedAt ? new Date(config.updatedAt).toLocaleString() : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {editingKey === config.key ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleSave(config.key)}
                            className="text-sm text-[var(--glass-tone-success-fg)] hover:underline"
                          >
                            {t('save')}
                          </button>
                          <button
                            onClick={() => setEditingKey(null)}
                            className="text-sm text-[var(--glass-text-secondary)] hover:underline"
                          >
                            {t('cancel')}
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <button
                            onClick={() => { setEditingKey(config.key); setEditValue(config.value) }}
                            className="text-sm text-[var(--glass-tone-info-fg)] hover:underline"
                          >
                            {t('edit')}
                          </button>
                          {sensitive && (
                            <button
                              onClick={() => setRevealedSensitiveKeys((keys) => {
                                const next = new Set(keys)
                                if (next.has(config.key)) next.delete(config.key)
                                else next.add(config.key)
                                return next
                              })}
                              className="text-sm text-[var(--glass-tone-warning-fg)] hover:underline"
                            >
                              {t(revealed ? 'hideValue' : 'showValue')}
                            </button>
                          )}
                          <button
                            onClick={() => setDeleteTargetId(config.id)}
                            className="text-sm text-[var(--glass-tone-danger-fg)] hover:underline"
                          >
                            {t('delete')}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 glass-overlay flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="glass-surface-modal p-6 w-full max-w-md">
            <h2 className="text-xl font-bold text-[var(--glass-text-primary)] mb-4">{t('createConfig')}</h2>
            <form onSubmit={handleCreate}>
              <div className="mb-4">
                <label className="block mb-2 text-sm text-[var(--glass-text-secondary)]">{t('configKey')}</label>
                <input
                  type="text"
                  value={newConfig.key}
                  onChange={e => setNewConfig(p => ({ ...p, key: e.target.value }))}
                  className="glass-input-base w-full px-3 py-2"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block mb-2 text-sm text-[var(--glass-text-secondary)]">{t('configValue')}</label>
                <input
                  type="text"
                  value={newConfig.value}
                  onChange={e => setNewConfig(p => ({ ...p, value: e.target.value }))}
                  className="glass-input-base w-full px-3 py-2"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block mb-2 text-sm text-[var(--glass-text-secondary)]">{t('description')}</label>
                <input
                  type="text"
                  value={newConfig.description}
                  onChange={e => setNewConfig(p => ({ ...p, description: e.target.value }))}
                  className="glass-input-base w-full px-3 py-2"
                />
              </div>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setShowModal(false)} className="glass-btn-base glass-btn-secondary px-4 py-2">{t('cancel')}</button>
                <button type="submit" className="glass-btn-base glass-btn-primary px-4 py-2" disabled={creating}>{creating ? t('creating') : t('save')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        show={Boolean(deleteTargetId)}
        title={t('deleteConfig')}
        message={t('confirmDeleteConfig')}
        confirmText={deleting ? t('deleting') : t('delete')}
        cancelText={t('cancel')}
        onConfirm={handleDelete}
        onCancel={() => (deleting ? undefined : setDeleteTargetId(null))}
        type="danger"
      />
    </div>
  )
}
