'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { apiFetch } from '@/lib/api-fetch'
import { AppIcon } from '@/components/ui/icons'
import { MediaImageWithLoading } from '@/components/media/MediaImageWithLoading'
import ImagePreviewModal from '@/components/ui/ImagePreviewModal'
import { StoryboardPanelAssetUploader } from './StoryboardPanelAssetPicker'
import type {
  CharacterAssetSummary,
  LocationAssetSummary,
  PropAssetSummary,
} from '@/lib/assets/contracts'

type GroupType = 'AIGC' | 'LivenessFace'
type AssetType = 'Image' | 'Video' | 'Audio'
type PickerKind = 'character' | 'location' | 'prop'

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
  const payload = await response.json() as {
    success?: boolean
    data?: T
    error?: { message?: string; code?: string }
    diagnostics?: { kind?: string; httpStatus?: number; upstreamCode?: string; upstreamMessage?: string }
  }
  if (!response.ok || !payload.success || payload.data === undefined) {
    // Build a descriptive error message that includes upstream diagnostics
    // when available, so the user can understand *why* the request failed
    // (e.g. network timeout, upstream rejected the asset URL, etc.).
    const baseMsg = payload.error?.message || 'MOBILE_CLOUD_ASSET_REQUEST_FAILED'
    const diag = payload.diagnostics
    const diagParts: string[] = []
    if (diag?.kind) diagParts.push(`kind=${diag.kind}`)
    if (diag?.httpStatus) diagParts.push(`HTTP ${diag.httpStatus}`)
    if (diag?.upstreamCode) diagParts.push(`upstream=${diag.upstreamCode}`)
    if (diag?.upstreamMessage && diag.upstreamMessage !== payload.error?.code) {
      diagParts.push(diag.upstreamMessage)
    }
    throw new Error(diagParts.length > 0 ? `${baseMsg} (${diagParts.join(', ')})` : baseMsg)
  }
  return payload.data
}

function getCharacterPreview(char: CharacterAssetSummary): string | null {
  const primaryVariant = char.variants.find((v) => v.index === 0) || char.variants[0]
  if (!primaryVariant) return null
  const selectedRenderIndex = primaryVariant.selectionState.selectedRenderIndex
  const selectedRender = selectedRenderIndex !== null
    ? primaryVariant.renders.find((r) => r.index === selectedRenderIndex)
    : null
  return selectedRender?.imageUrl
    || primaryVariant.renders.find((r) => r.isSelected)?.imageUrl
    || primaryVariant.renders[0]?.imageUrl
    || null
}

function getVisualAssetPreview(asset: LocationAssetSummary | PropAssetSummary): string | null {
  const selectedVariant = asset.selectedVariantId
    ? asset.variants.find((v) => v.id === asset.selectedVariantId)
    : null
  const targetVariant = selectedVariant || asset.variants[0]
  if (!targetVariant) return null
  return targetVariant.renders.find((r) => r.isSelected)?.imageUrl
    || targetVariant.renders[0]?.imageUrl
    || null
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
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerKind, setPickerKind] = useState<PickerKind>('character')
  const [pickerAssets, setPickerAssets] = useState<CharacterAssetSummary[] | LocationAssetSummary[] | PropAssetSummary[]>([])
  const [pickerLoading, setPickerLoading] = useState(false)
  const [pickerSearch, setPickerSearch] = useState('')
  const [pickerSelectedId, setPickerSelectedId] = useState<string | null>(null)
  const [pickerResolving, setPickerResolving] = useState(false)
  const [pickerError, setPickerError] = useState('')
  const [previewImage, setPreviewImage] = useState<string | null>(null)

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
        const assetData = await readData<{ items: Asset[] }>(await apiFetch(`/api/asset-hub/mobile-cloud?resource=assets&groupType=${encodeURIComponent(groupType)}&groupIds=${encodeURIComponent(groupIds.join(','))}&pageSize=100`))
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

  const getAssetTypeIcon = (type: AssetType) => {
    if (type === 'Video') return 'video' as const
    if (type === 'Audio') return 'audioWave' as const
    return 'image' as const
  }

  const getAssetStatusClassName = (status: Asset['status']) => {
    if (status === 'ACTIVE') return 'bg-[var(--glass-tone-success-bg)] text-[var(--glass-tone-success-fg)]'
    if (status === 'FAILED') return 'bg-[var(--glass-tone-danger-bg)] text-[var(--glass-tone-danger-fg)]'
    return 'bg-[var(--glass-tone-warning-bg)] text-[var(--glass-tone-warning-fg)]'
  }

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

  const reopenRealPersonAuth = () => {
    if (!authSession?.h5Link) return
    window.open(authSession.h5Link, '_blank', 'noopener,noreferrer')
  }

  const openPicker = useCallback(async (kind: PickerKind) => {
    setPickerOpen(true)
    setPickerKind(kind)
    setPickerSearch('')
    setPickerSelectedId(null)
    setPickerError('')
    setPickerLoading(true)
    try {
      const res = await apiFetch(`/api/assets?scope=global&kind=${kind}`)
      if (!res.ok) throw new Error(t('requestFailed'))
      const data = await res.json() as { assets: CharacterAssetSummary[] | LocationAssetSummary[] | PropAssetSummary[] }
      setPickerAssets(data.assets || [])
    } catch (cause) {
      setPickerError(cause instanceof Error ? cause.message : t('requestFailed'))
      setPickerAssets([])
    } finally {
      setPickerLoading(false)
    }
  }, [t])

  const switchPickerKind = useCallback(async (kind: PickerKind) => {
    setPickerKind(kind)
    setPickerSearch('')
    setPickerSelectedId(null)
    setPickerError('')
    setPickerLoading(true)
    try {
      const res = await apiFetch(`/api/assets?scope=global&kind=${kind}`)
      if (!res.ok) throw new Error(t('requestFailed'))
      const data = await res.json() as { assets: CharacterAssetSummary[] | LocationAssetSummary[] | PropAssetSummary[] }
      setPickerAssets(data.assets || [])
    } catch (cause) {
      setPickerError(cause instanceof Error ? cause.message : t('requestFailed'))
      setPickerAssets([])
    } finally {
      setPickerLoading(false)
    }
  }, [t])

  const confirmPickerSelection = useCallback(async () => {
    if (!pickerSelectedId) return
    setPickerResolving(true)
    setPickerError('')
    try {
      const res = await apiFetch(`/api/asset-hub/mobile-cloud/resolve-asset-url?kind=${pickerKind}&assetId=${encodeURIComponent(pickerSelectedId)}`)
      const data = await readData<{ assetName: string; signedUrl: string }>(res)
      setAssetName(data.assetName)
      setAssetUrl(data.signedUrl)
      setAssetType('Image')
      setPickerOpen(false)
    } catch (cause) {
      setPickerError(cause instanceof Error ? cause.message : t('requestFailed'))
    } finally {
      setPickerResolving(false)
    }
  }, [pickerKind, pickerSelectedId, t])

  const filteredPickerAssets = useMemo(() => {
    if (!pickerSearch.trim()) return pickerAssets
    const q = pickerSearch.toLowerCase()
    return pickerAssets.filter((asset) => asset.name.toLowerCase().includes(q))
  }, [pickerAssets, pickerSearch])

  const getPickerPreview = useCallback((asset: CharacterAssetSummary | LocationAssetSummary | PropAssetSummary): string | null => {
    if (asset.kind === 'character') return getCharacterPreview(asset)
    return getVisualAssetPreview(asset as LocationAssetSummary | PropAssetSummary)
  }, [])

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
                <button type="button" onClick={openRealPersonAuth} disabled={saving} className="glass-btn-tone-info rounded-lg px-3 py-1.5 text-xs">
                  {t('createRealGroup')}
                </button>
              )}
            </div>
          </div>

          {authSession && (
            <div className="mb-4 rounded-xl border border-[var(--glass-tone-warning-border)] bg-[var(--glass-tone-warning-bg)] p-3 text-xs text-[var(--glass-text-secondary)]">
              <p>{t('authHint')}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={reopenRealPersonAuth} disabled={saving} className="glass-btn-base rounded-lg px-3 py-1.5">
                  {t('continueRealAuth')}
                </button>
                <button type="button" onClick={syncRealPersonGroup} disabled={saving} className="glass-btn-tone-info rounded-lg px-3 py-1.5">
                  {t('syncAuth')}
                </button>
              </div>
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
              {groupType === 'LivenessFace' && (
                <div className="rounded-xl border border-[var(--glass-tone-info-border)] bg-[var(--glass-tone-info-bg)] p-3">
                  <div className="flex items-start gap-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--glass-bg-surface-strong)] text-[var(--glass-tone-info-fg)]">
                      <AppIcon name="user" className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-xs font-medium text-[var(--glass-text-primary)]">{t('realCreateTitle')}</p>
                      <p className="mt-1 text-[11px] leading-5 text-[var(--glass-text-secondary)]">{t('realCreateHint')}</p>
                    </div>
                  </div>
                  <button type="button" onClick={openRealPersonAuth} disabled={saving} className="glass-btn-tone-info mt-3 w-full rounded-lg px-3 py-1.5 text-xs">
                    {t('createRealGroup')}
                  </button>
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
                <>
                  <div className="mb-2 flex flex-wrap gap-2">
                    {(['character', 'location', 'prop'] as const).map((kind) => (
                      <button
                        key={kind}
                        type="button"
                        onClick={() => openPicker(kind)}
                        disabled={saving}
                        className="glass-btn-base rounded-lg px-3 py-1.5 text-xs"
                      >
                        <AppIcon name="image" className="mr-1 inline h-3 w-3" />
                        {kind === 'character' ? t('pickCharacter') : kind === 'location' ? t('pickLocation') : t('pickProp')}
                      </button>
                    ))}
                    {groupType === 'AIGC' && (
                      <StoryboardPanelAssetUploader groupId={selectedGroupId} onUploaded={refresh} />
                    )}
                  </div>
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
                </>
              )}
              <div className="app-scrollbar max-h-[420px] min-h-[180px] overflow-y-auto pr-1">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {selectedAssets.map((asset) => (
                    <a
                      key={asset.assetId}
                      href={asset.assetUrl || undefined}
                      target="_blank"
                      rel="noreferrer"
                      className="group overflow-hidden rounded-xl border border-[var(--glass-border-subtle)] bg-[var(--glass-bg-surface)] transition hover:-translate-y-0.5 hover:border-[var(--glass-tone-info-border)] hover:shadow-md"
                      title={asset.assetName || asset.assetId}
                    >
                      <div className="relative aspect-[16/10] overflow-hidden bg-[var(--glass-bg-muted)]">
                        {asset.assetType === 'Image' && asset.assetUrl ? (
                          <MediaImageWithLoading
                            src={asset.assetUrl}
                            alt={asset.assetName || asset.assetId}
                            containerClassName="h-full w-full"
                            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                          />
                        ) : asset.assetType === 'Video' && asset.assetUrl ? (
                          <video
                            src={asset.assetUrl}
                            muted
                            playsInline
                            preload="metadata"
                            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                          />
                        ) : (
                          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-[var(--glass-text-tertiary)]">
                            <AppIcon name={getAssetTypeIcon(asset.assetType)} className="h-8 w-8" />
                            <span className="text-[10px]">{asset.assetType}</span>
                          </div>
                        )}
                        <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-[var(--glass-bg-surface-strong)]/90 px-2 py-1 text-[10px] font-medium text-[var(--glass-text-secondary)] shadow-sm backdrop-blur-sm">
                          <AppIcon name={getAssetTypeIcon(asset.assetType)} className="h-3 w-3" />
                          {asset.assetType}
                        </span>
                        <span className={`absolute right-2 top-2 rounded-full px-2 py-1 text-[10px] font-medium ${getAssetStatusClassName(asset.status)}`}>
                          {asset.status}
                        </span>
                      </div>
                      <div className="p-3">
                        <p className="truncate text-sm font-medium text-[var(--glass-text-primary)]">{asset.assetName || asset.assetId}</p>
                        <p className="mt-1 truncate text-[10px] text-[var(--glass-text-tertiary)]">{asset.assetId}</p>
                        {asset.status === 'FAILED' && asset.errorMessage && (
                          <p className="mt-2 line-clamp-2 text-[10px] leading-4 text-[var(--glass-tone-danger-fg)]">{asset.errorMessage}</p>
                        )}
                      </div>
                    </a>
                  ))}
                </div>
              </div>
              {selectedGroupId && !loading && selectedAssets.length === 0 && <p className="rounded-xl border border-dashed border-[var(--glass-border-subtle)] py-8 text-center text-xs text-[var(--glass-text-tertiary)]">{t('noAssets')}</p>}
            </div>
          </div>
        </div>
      )}

      {pickerOpen && (
        <div className="glass-overlay fixed inset-0 z-50 flex items-center justify-center">
          <div className="glass-surface-modal flex max-h-[80vh] w-[600px] flex-col">
            <div className="flex items-center justify-between px-6 py-4">
              <h2 className="text-lg font-semibold text-[var(--glass-text-primary)]">{t('pickerTitle')}</h2>
              <button type="button" onClick={() => setPickerOpen(false)} className="glass-btn-base glass-btn-soft text-[var(--glass-text-tertiary)]">
                <AppIcon name="close" className="h-5 w-5" />
              </button>
            </div>

            <div className="flex gap-2 px-6 pb-3" role="tablist" aria-label={t('pickerTypeLabel')}>
              {(['character', 'location', 'prop'] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  role="tab"
                  aria-selected={pickerKind === kind}
                  onClick={() => switchPickerKind(kind)}
                  className={`rounded-lg px-3 py-1.5 text-xs transition ${pickerKind === kind ? 'glass-btn-tone-info' : 'glass-btn-base text-[var(--glass-text-secondary)]'}`}
                >
                  {kind === 'character' ? t('pickCharacter') : kind === 'location' ? t('pickLocation') : t('pickProp')}
                </button>
              ))}
            </div>

            <div className="px-6 pb-3">
              <div className="relative">
                <AppIcon name="search" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--glass-text-tertiary)]" />
                <input
                  type="text"
                  value={pickerSearch}
                  onChange={(event) => setPickerSearch(event.target.value)}
                  placeholder={t('pickerSearch')}
                  className="glass-input-base w-full py-2 pl-9 pr-4 text-sm"
                />
              </div>
            </div>

            {pickerError && <p className="mx-6 mb-3 rounded-lg bg-[var(--glass-tone-danger-bg)] px-3 py-2 text-xs text-[var(--glass-tone-danger-fg)]">{pickerError}</p>}

            <div className="flex-1 overflow-y-auto p-4">
              {pickerLoading ? (
                <div className="flex h-40 items-center justify-center">
                  <span className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--glass-stroke-strong)] border-t-[var(--glass-tone-info-fg)]" />
                </div>
              ) : filteredPickerAssets.length === 0 ? (
                <div className="flex h-40 flex-col items-center justify-center text-[var(--glass-text-tertiary)]">
                  <AppIcon name="image" className="mb-2 h-12 w-12" />
                  <p className="text-sm">{t('pickerEmpty')}</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  {filteredPickerAssets.map((asset) => {
                    const preview = getPickerPreview(asset)
                    return (
                      <div
                        key={asset.id}
                        onClick={() => setPickerSelectedId(asset.id)}
                        className={`relative cursor-pointer rounded-xl border-2 p-2 transition-all hover:shadow-md ${pickerSelectedId === asset.id ? 'border-[var(--glass-stroke-focus)] bg-[var(--glass-tone-info-bg)]' : 'border-[var(--glass-stroke-base)] hover:border-[var(--glass-stroke-focus)]'}`}
                      >
                        {pickerSelectedId === asset.id && (
                          <AppIcon name="badgeCheck" className="absolute -right-2 -top-2 h-6 w-6 rounded-full bg-[var(--glass-bg-surface)] text-[var(--glass-tone-info-fg)]" />
                        )}
                        <div className="relative mb-2 aspect-[3/2] overflow-hidden rounded-lg bg-[var(--glass-bg-muted)]">
                          {preview ? (
                            <MediaImageWithLoading
                              src={preview}
                              alt={asset.name}
                              containerClassName="h-full w-full"
                              className="h-full w-full cursor-zoom-in object-contain"
                              onClick={(e: React.MouseEvent) => {
                                e.stopPropagation()
                                setPreviewImage(preview)
                              }}
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-[var(--glass-text-tertiary)]">
                              <AppIcon name="image" className="h-12 w-12" />
                            </div>
                          )}
                        </div>
                        <div className="text-center">
                          <p className="truncate text-sm font-medium text-[var(--glass-text-primary)]">{asset.name}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 border-t border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface-strong)] px-6 py-4">
              <button type="button" onClick={() => setPickerOpen(false)} className="glass-btn-base glass-btn-secondary px-4 py-2 text-sm">
                {t('pickerCancel')}
              </button>
              <button
                type="button"
                onClick={confirmPickerSelection}
                disabled={!pickerSelectedId || pickerResolving}
                className="glass-btn-base glass-btn-primary flex items-center gap-2 rounded-lg px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pickerResolving && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
                {t('pickerConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {previewImage && (
        <ImagePreviewModal imageUrl={previewImage} onClose={() => setPreviewImage(null)} />
      )}
    </section>
  )
}
