'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import Navbar from '@/components/Navbar'
import { apiFetch } from '@/lib/api-fetch'

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

  const isPlatformAdmin = (session?.user as any)?.isPlatformAdmin

  useEffect(() => {
    if (status === 'loading') return
    if (!session) router.push('/auth/signin')
  }, [session, status, router])

  const fetchConfigs = () => {
    apiFetch('/api/platform/config')
      .then(res => res.json())
      .then(data => setConfigs(Array.isArray(data) ? data : []))
      .catch(console.error)
  }

  useEffect(() => {
    if (!isPlatformAdmin) return
    fetchConfigs()
    setLoading(false)
  }, [isPlatformAdmin])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newConfig.key.trim() || !newConfig.value.trim()) return
    setCreating(true)
    try {
      await apiFetch('/api/platform/config', {
        method: 'POST',
        body: JSON.stringify(newConfig),
      })
      setShowModal(false)
      setNewConfig({ key: '', value: '', description: '' })
      fetchConfigs()
    } catch (e) {
      console.error(e)
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除该配置项吗？')) return
    try {
      await apiFetch(`/api/platform/config/${id}`, { method: 'DELETE' })
      fetchConfigs()
    } catch (e) {
      console.error(e)
    }
  }

  const handleSave = async (key: string) => {
    try {
      await apiFetch('/api/platform/config', {
        method: 'PATCH',
        body: JSON.stringify({ key, value: editValue }),
      })
      setConfigs(configs.map(c => c.key === key ? { ...c, value: editValue } : c))
      setEditingKey(null)
    } catch (e) {
      console.error(e)
    }
  }

  if (status === 'loading' || !session) {
    return (
      <div className="min-h-screen bg-[var(--glass-bg-root)]">
        <Navbar />
        <div className="flex items-center justify-center h-[calc(100vh-64px)]">
          <div className="animate-pulse text-[var(--glass-text-secondary)]">{t('loading')}</div>
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
          <p className="text-[var(--glass-text-secondary)]">{t('noPermission')}</p>
        </div>
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
            <button onClick={() => setShowModal(true)} className="glass-btn-base glass-btn-primary px-4 py-2">{'新增配置'}</button>
            <a href="/admin/platform" className="glass-btn-base px-4 py-2">{t('back')}</a>
          </div>
        </div>

        <div className="glass-surface overflow-hidden">
          {loading ? (
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
                {configs.map((config) => (
                  <tr key={config.id} className="hover:bg-[var(--glass-bg-muted)]/50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-[var(--glass-text-primary)]">{config.key}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--glass-text-secondary)]">
                      {editingKey === config.key ? (
                        <input
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="glass-input w-full"
                        />
                      ) : (
                        <span className="max-w-xs truncate block">{config.value}</span>
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
                          <button
                            onClick={() => handleDelete(config.id)}
                            className="text-sm text-[var(--glass-tone-danger-fg)] hover:underline"
                          >
                            {t('delete') || '删除'}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 glass-overlay flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="glass-surface-modal p-6 w-full max-w-md">
            <h2 className="text-xl font-bold text-[var(--glass-text-primary)] mb-4">{'新增配置'}</h2>
            <form onSubmit={handleCreate}>
              <div className="mb-4">
                <label className="block mb-2 text-sm text-[var(--glass-text-secondary)]">{'配置键'}</label>
                <input
                  type="text"
                  value={newConfig.key}
                  onChange={e => setNewConfig(p => ({ ...p, key: e.target.value }))}
                  className="glass-input-base w-full px-3 py-2"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block mb-2 text-sm text-[var(--glass-text-secondary)]">{'配置值'}</label>
                <input
                  type="text"
                  value={newConfig.value}
                  onChange={e => setNewConfig(p => ({ ...p, value: e.target.value }))}
                  className="glass-input-base w-full px-3 py-2"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block mb-2 text-sm text-[var(--glass-text-secondary)]">{'描述'}</label>
                <input
                  type="text"
                  value={newConfig.description}
                  onChange={e => setNewConfig(p => ({ ...p, description: e.target.value }))}
                  className="glass-input-base w-full px-3 py-2"
                />
              </div>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setShowModal(false)} className="glass-btn-base glass-btn-secondary px-4 py-2">{t('cancel')}</button>
                <button type="submit" className="glass-btn-base glass-btn-primary px-4 py-2" disabled={creating}>{creating ? '创建中...' : t('save')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
