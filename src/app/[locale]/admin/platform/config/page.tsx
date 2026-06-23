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

  const isPlatformAdmin = (session?.user as any)?.isPlatformAdmin

  useEffect(() => {
    if (status === 'loading') return
    if (!session) router.push('/auth/signin')
  }, [session, status, router])

  useEffect(() => {
    if (!isPlatformAdmin) return
    apiFetch('/api/platform/config')
      .then(res => res.json())
      .then(data => setConfigs(Array.isArray(data) ? data : []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [isPlatformAdmin])

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
          <a href="/admin/platform" className="glass-btn-base px-4 py-2">{t('back')}</a>
        </div>

        <div className="glass-surface overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-[var(--glass-text-secondary)]">{t('loading')}</div>
          ) : configs.length === 0 ? (
            <div className="p-8 text-center text-[var(--glass-text-secondary)]">暂无配置项</div>
          ) : (
            <table className="w-full">
              <thead className="bg-[var(--glass-bg-muted)]">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[var(--glass-text-secondary)] uppercase tracking-wider">配置键</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[var(--glass-text-secondary)] uppercase tracking-wider">值</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[var(--glass-text-secondary)] uppercase tracking-wider">描述</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[var(--glass-text-secondary)] uppercase tracking-wider">更新时间</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[var(--glass-text-secondary)] uppercase tracking-wider">操作</th>
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
                            保存
                          </button>
                          <button
                            onClick={() => setEditingKey(null)}
                            className="text-sm text-[var(--glass-text-secondary)] hover:underline"
                          >
                            取消
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setEditingKey(config.key); setEditValue(config.value) }}
                          className="text-sm text-[var(--glass-tone-info-fg)] hover:underline"
                        >
                          编辑
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
