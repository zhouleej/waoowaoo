'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { apiFetch } from '@/lib/api-fetch'
import { AppIcon } from '@/components/ui/icons'

type GroupType = 'AIGC' | 'LivenessFace'
type AssetType = 'Image' | 'Video' | 'Audio'

interface Group {
  groupId: string
  groupType: GroupType
  groupName: string
  description: string
}

interface Asset {
  assetId: string
  groupId: string
  assetName: string
  assetType: AssetType
  assetUrl: string
  status: 'PROCESSING' | 'ACTIVE' | 'FAILED'
  errorMessage?: string
}

interface MobileCloudAssetPanelProps {
  docsUrl?: string
}

async function readData<T>(response: Response): Promise<T> {
  const payload = await response.json() as { success?: boolean; data?: T; error?: { message?: string } }
  if (!response.ok || !payload.success || payload.data === undefined) {
    throw new Error(payload.error?.message || 'MOBILE_CLOUD_ASSET_REQUEST_FAILED')
  }
  return payload.data
}

export default function MobileCloudAssetPanel({ docsUrl = 'https://ecloud.10086.cn/op-help-center/doc/outline/108290' }: MobileCloudAssetPanelProps) {
  const t = useTranslations('assetHub.mobileCloud')
  const [open, setOpen] = useState(true)
  const [groupType, setGroupType] = useState<GroupType>('AIGC')
  const [groups, setGroups] = useState<Group[]>([])
  const [assets, setAssets] = useState<Asset[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [groupName, setGroupName] = useState('')
  const [groupDescription, setGroupDescription] = useState('')
  const [assetName, setAssetName] = useState('')
  const [assetUrl, setAssetUrl] = useState('')
  const [assetType, setAssetType] = useState<AssetType>('Image')
  const [authSession, setAuthSession] = useState<{ bytedToken: string; h5Link: string } | null>(null)

  const visibleGroups = useMemo(() => groups.filter((group) => group.groupType === groupType), [groups, groupType])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const groupData = await readData<{ items: Group[] }>(await apiFetch(`/api/asset-hub/mobile-cloud?resource=groups&groupType=${groupType}&pageSize=100`))
      setGroups(groupData.items)
      const groupIds = groupData.items.map((group) => group.groupId)
      if (groupIds.length === 0) {
        setAssets([])
        setSelectedGroupId('')
      } else {
        const assetData = await readData<{ items: Asset[] }>(await apiFetch(`/api/asset-hub/mobile-cloud?resource=assets&groupIds=${encodeURIComponent(groupIds.join(','))}&pageSize=100`))
        setAssets(assetData.items)
        setSelectedGroupId((current) => groupIds.includes(current) ? current : groupIds[0])
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('requestFailed'))
    } finally {
      setLoading(false)
    }
  }, [groupType, t])

  useEffect(() => {
    if (open) void refresh()
  }, [open, refresh])

  const selectedAssets = assets.filter((asset) => asset.groupId === selectedGroupId)

  const createGroup = async () => {
    if (!groupName.trim()) return
    setSaving(true)
    try {
      await readData(await apiFetch('/api/asset-hub/mobile-cloud', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource: 'group', groupType: 'AIGC', groupName, description: groupDescription }),
      }))
      setGroupName('')
      setGroupDescription('')
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('requestFailed'))
    } finally {
      setSaving(false)
    }
  }

  const createAsset = async () => {
    if (!selectedGroupId || !assetName.trim() || !assetUrl.trim()) return
    setSaving(true)
    try {
      await readData(await apiFetch('/api/asset-hub/mobile-cloud', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource: 'asset', groupId: selectedGroupId, assetName, assetUrl, assetType }),
      }))
      setAssetName('')
      setAssetUrl('')
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('requestFailed'))
    } finally {
      setSaving(false)
    }
  }

  const openRealPersonAuth = async () => {
    setSaving(true)
    setError('')
    try {
      const data = await readData<{ bytedToken: string; h5Link: string }>(await apiFetch('/api/asset-hub/mobile-cloud', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource: 'real-person-session' }),
      }))
      setAuthSession(data)
      window.open(data.h5Link, '_blank', 'noopener,noreferrer')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('requestFailed'))
    } finally {
      setSaving(false)
    }
  }

  const syncRealPersonGroup = async () => {
    if (!authSession?.bytedToken) return
    setSaving(true)
    try {
      await readData(await apiFetch('/api/asset-hub/mobile-cloud', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource: 'real-person-group', bytedToken: authSession.bytedToken }),
      }))
      setGroupType('LivenessFace')
      setAuthSession(null)
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('requestFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="glass-panel mb-6 overflow-hidden rounded-2xl">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <AppIcon name="cloudUpload" className="h-5 w-5 text-[var(--glass-tone-info-fg)]" />
          <span>
            <span className="block text-sm font-semibold text-[var(--glass-text-primary)]">{t('title')}</span>
            <span className="block text-xs text-[var(--glass-text-tertiary)]">{t('description')}</span>
          </span>
        </span>
        <AppIcon name={open ? 'chevronUp' : 'chevronDown'} className="h-4 w-4 text-[var(--glass-text-tertiary)]" />
      </button>

      {open && (
        <div className="border-t border-[var(--glass-border-subtle)] px-5 pb-5 pt-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2" role="tablist" aria-label={t('typeLabel')}>
              {(['AIGC', 'LivenessFace'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  role="tab"
                  aria-selected={groupType === type}
                  onClick={() => setGroupType(type)}
                  className={`rounded-lg px-3 py-1.5 text-xs transition ${groupType === type ? 'glass-btn-tone-info' : 'glass-btn-base text-[var(--glass-text-secondary)]'}`}
                >
                  {type === 'AIGC' ? t('virtualTab') : t('realTab')}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <a href={docsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-[var(--glass-tone-info-fg)] hover:underline">
                {t('docs')} <AppIcon name="externalLink" className="h-3 w-3" />
              </a>
              {groupType === 'LivenessFace' && (
                <button type="button" onClick={openRealPersonAuth} disabled={saving} className="glass-btn-base rounded-lg px-3 py-1.5 text-xs">
                  {t('realAuth')}
                </button>
              )}
            </div>
          </div>

          {authSession && (
            <div className="mb-4 rounded-xl border border-[var(--glass-tone-warning-border)] bg-[var(--glass-tone-warning-bg)] p-3 text-xs text-[var(--glass-text-secondary)]">
              <p>{t('authHint')}</p>
              <button type="button" onClick={syncRealPersonGroup} disabled={saving} className="glass-btn-tone-info mt-2 rounded-lg px-3 py-1.5">
                {t('syncAuth')}
              </button>
            </div>
          )}

          {error && <p className="mb-3 rounded-lg bg-[var(--glass-tone-danger-bg)] px-3 py-2 text-xs text-[var(--glass-tone-danger-fg)]">{error}</p>}

          <div className="grid gap-4 lg:grid-cols-[minmax(180px,0.8fr)_minmax(0,1.4fr)]">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[var(--glass-text-secondary)]">{t('groups')}</span>
                <button type="button" onClick={() => void refresh()} disabled={loading} className="text-[var(--glass-text-tertiary)] hover:text-[var(--glass-text-primary)]" aria-label={t('refresh')}>
                  <AppIcon name="refresh" className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>
              {groupType === 'AIGC' && (
                <div className="space-y-2 rounded-xl border border-dashed border-[var(--glass-border-subtle)] p-3">
                  <input value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder={t('groupName')} className="glass-input w-full text-xs" />
                  <input value={groupDescription} onChange={(event) => setGroupDescription(event.target.value)} placeholder={t('groupDescription')} className="glass-input w-full text-xs" />
                  <button type="button" onClick={createGroup} disabled={saving || !groupName.trim()} className="glass-btn-tone-info w-full rounded-lg px-3 py-1.5 text-xs">{t('createGroup')}</button>
                </div>
              )}
              {visibleGroups.map((group) => (
                <button key={group.groupId} type="button" onClick={() => setSelectedGroupId(group.groupId)} className={`w-full rounded-xl border px-3 py-2 text-left ${group.groupId === selectedGroupId ? 'border-[var(--glass-tone-info-border)] bg-[var(--glass-tone-info-bg)]' : 'border-[var(--glass-border-subtle)]'}`}>
                  <span className="block truncate text-xs font-medium text-[var(--glass-text-primary)]">{group.groupName || group.groupId}</span>
                  <span className="block truncate text-[10px] text-[var(--glass-text-tertiary)]">{group.groupId}</span>
                </button>
              ))}
              {!loading && visibleGroups.length === 0 && <p className="py-4 text-center text-xs text-[var(--glass-text-tertiary)]">{t('noGroups')}</p>}
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-[var(--glass-text-secondary)]">{t('assets')}</span>
                <span className="text-[10px] text-[var(--glass-text-tertiary)]">{selectedGroupId || t('selectGroup')}</span>
              </div>
              {selectedGroupId && (
                <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_1.5fr_auto_auto]">
                  <input value={assetName} onChange={(event) => setAssetName(event.target.value)} placeholder={t('assetName')} className="glass-input text-xs" />
                  <input value={assetUrl} onChange={(event) => setAssetUrl(event.target.value)} placeholder={t('assetUrl')} className="glass-input text-xs" />
                  <select value={assetType} onChange={(event) => setAssetType(event.target.value as AssetType)} className="glass-input text-xs">
                    <option value="Image">{t('image')}</option>
                    <option value="Video">{t('video')}</option>
                    <option value="Audio">{t('audio')}</option>
                  </select>
                  <button type="button" onClick={createAsset} disabled={saving || !assetName.trim() || !assetUrl.trim()} className="glass-btn-tone-info rounded-lg px-3 py-2 text-xs">{t('addAsset')}</button>
                </div>
              )}
              <div className="grid gap-2 sm:grid-cols-2">
                {selectedAssets.map((asset) => (
                  <a key={asset.assetId} href={asset.assetUrl || undefined} target="_blank" rel="noreferrer" className="rounded-xl border border-[var(--glass-border-subtle)] p-3 transition hover:border-[var(--glass-tone-info-border)]">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-medium text-[var(--glass-text-primary)]">{asset.assetName || asset.assetId}</span>
                      <span className="shrink-0 text-[10px] text-[var(--glass-text-tertiary)]">{asset.status}</span>
                    </span>
                    <span className="mt-1 block truncate text-[10px] text-[var(--glass-text-tertiary)]">{asset.assetType} · {asset.assetId}</span>
                    {asset.status === 'FAILED' && asset.errorMessage && <span className="mt-1 block text-[10px] text-[var(--glass-tone-danger-fg)]">{asset.errorMessage}</span>}
                  </a>
                ))}
              </div>
              {selectedGroupId && !loading && selectedAssets.length === 0 && <p className="rounded-xl border border-dashed border-[var(--glass-border-subtle)] py-8 text-center text-xs text-[var(--glass-text-tertiary)]">{t('noAssets')}</p>}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
