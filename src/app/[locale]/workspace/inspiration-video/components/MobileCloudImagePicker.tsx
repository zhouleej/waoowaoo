'use client'

import Image from 'next/image'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { apiFetch } from '@/lib/api-fetch'
import { readApiErrorMessage } from '@/lib/api/read-error-message'
import type {
  MobileCloudAsset,
  MobileCloudAssetGroup,
  MobileCloudPage,
} from '@/lib/mobile-cloud-maas/asset-types'
import GlassModalShell from '@/components/ui/primitives/GlassModalShell'
import { AppIcon } from '@/components/ui/icons'
import type { MobileCloudImageSelection } from '../types'

type Props = {
  open: boolean
  multiple: boolean
  maxSelection: number
  initialSelection: MobileCloudImageSelection[]
  onClose: () => void
  onConfirm: (assets: MobileCloudImageSelection[]) => void
}

const PAGE_SIZE = 24

async function readPage<T>(response: Response, fallbackMessage: string): Promise<MobileCloudPage<T>> {
  if (!response.ok) throw new Error(await readApiErrorMessage(response, fallbackMessage))
  const payload = await response.json() as { success?: boolean; data?: MobileCloudPage<T> }
  if (!payload.success || !payload.data) throw new Error(fallbackMessage)
  return payload.data
}

function toSelection(asset: MobileCloudAsset): MobileCloudImageSelection {
  return {
    assetId: asset.assetId,
    assetName: asset.assetName,
    assetUrl: asset.assetUrl,
    groupId: asset.groupId,
  }
}

export default function MobileCloudImagePicker({
  open,
  multiple,
  maxSelection,
  initialSelection,
  onClose,
  onConfirm,
}: Props) {
  const t = useTranslations('inspirationVideo')
  const [groups, setGroups] = useState<MobileCloudAssetGroup[]>([])
  const [assets, setAssets] = useState<MobileCloudAsset[]>([])
  const [groupId, setGroupId] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [pageNo, setPageNo] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<Map<string, MobileCloudImageSelection>>(new Map())

  useEffect(() => {
    if (!open) return
    setSelected(new Map(initialSelection.map((asset) => [asset.assetId, asset])))
    setError('')
  }, [initialSelection, open])

  useEffect(() => {
    if (!open) return
    let active = true
    const loadGroups = async () => {
      try {
        const query = new URLSearchParams({ resource: 'groups', groupType: 'AIGC', pageSize: '100' })
        const page = await readPage<MobileCloudAssetGroup>(
          await apiFetch(`/api/asset-hub/mobile-cloud?${query.toString()}`),
          t('mobileCloudPicker.loadFailed'),
        )
        if (active) setGroups(page.items)
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : t('mobileCloudPicker.loadFailed'))
      }
    }
    void loadGroups()
    return () => { active = false }
  }, [open, t])

  const loadAssets = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const query = new URLSearchParams({
        resource: 'assets',
        groupType: 'AIGC',
        statuses: 'ACTIVE',
        pageNo: String(pageNo),
        pageSize: String(PAGE_SIZE),
      })
      if (groupId) query.set('groupIds', groupId)
      if (search) query.set('assetName', search)
      const page = await readPage<MobileCloudAsset>(
        await apiFetch(`/api/asset-hub/mobile-cloud?${query.toString()}`),
        t('mobileCloudPicker.loadFailed'),
      )
      setAssets(page.items.filter((asset) => asset.assetType === 'Image' && asset.status === 'ACTIVE'))
      setTotal(page.total)
    } catch (cause) {
      setAssets([])
      setTotal(0)
      setError(cause instanceof Error ? cause.message : t('mobileCloudPicker.loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [groupId, pageNo, search, t])

  useEffect(() => {
    if (open) void loadAssets()
  }, [loadAssets, open])

  const groupNames = useMemo(
    () => new Map(groups.map((group) => [group.groupId, group.groupName])),
    [groups],
  )
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const toggleAsset = (asset: MobileCloudAsset) => {
    setSelected((current) => {
      const next = new Map(current)
      if (next.has(asset.assetId)) {
        next.delete(asset.assetId)
        return next
      }
      if (!multiple) return new Map([[asset.assetId, toSelection(asset)]])
      if (next.size >= maxSelection) return next
      next.set(asset.assetId, toSelection(asset))
      return next
    })
  }

  const footer = (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-xs text-[var(--glass-text-tertiary)]">
        {t('mobileCloudPicker.selectedCount', { count: selected.size, max: maxSelection })}
      </span>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="glass-btn-base glass-btn-secondary rounded-xl px-4 py-2 text-sm">
          {t('mobileCloudPicker.cancel')}
        </button>
        <button
          type="button"
          disabled={selected.size === 0 || selected.size > maxSelection}
          onClick={() => onConfirm(Array.from(selected.values()))}
          className="glass-btn-base glass-btn-primary rounded-xl px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-45"
        >
          {t('mobileCloudPicker.confirm')}
        </button>
      </div>
    </div>
  )

  return (
    <GlassModalShell
      open={open}
      onClose={onClose}
      size="xl"
      title={t('mobileCloudPicker.title')}
      description={t('mobileCloudPicker.description')}
      footer={footer}
      panelClassName="flex h-[calc(100dvh-2rem)] max-h-[860px] flex-col sm:h-[calc(100dvh-3rem)]"
      bodyClassName="min-h-0 flex-1 overflow-hidden"
    >
      <div className="flex h-full min-h-0 flex-col gap-4">
        <div className="grid shrink-0 gap-3 sm:grid-cols-[220px_minmax(0,1fr)_auto]">
          <select
            value={groupId}
            onChange={(event) => { setGroupId(event.target.value); setPageNo(1) }}
            className="glass-input-base h-10 rounded-xl px-3 text-sm"
            aria-label={t('mobileCloudPicker.group')}
          >
            <option value="">{t('mobileCloudPicker.allGroups')}</option>
            {groups.map((group) => <option key={group.groupId} value={group.groupId}>{group.groupName}</option>)}
          </select>
          <div className="relative">
            <AppIcon name="search" className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-[var(--glass-text-tertiary)]" />
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') { setSearch(searchInput.trim()); setPageNo(1) }
              }}
              placeholder={t('mobileCloudPicker.searchPlaceholder')}
              className="glass-input-base h-10 w-full rounded-xl pl-9 pr-3 text-sm"
            />
          </div>
          <button
            type="button"
            onClick={() => { setSearch(searchInput.trim()); setPageNo(1) }}
            className="glass-btn-base glass-btn-secondary rounded-xl px-4 py-2 text-sm"
          >
            {t('mobileCloudPicker.search')}
          </button>
        </div>

        {error ? (
          <div className="flex shrink-0 items-center justify-between gap-3 rounded-xl bg-[var(--glass-tone-danger-bg)] px-3 py-2 text-sm text-[var(--glass-tone-danger-fg)]">
            <span>{error}</span>
            <button type="button" className="shrink-0 underline" onClick={() => void loadAssets()}>{t('mobileCloudPicker.retry')}</button>
          </div>
        ) : null}

        <div className="app-scrollbar min-h-0 flex-1 overflow-y-auto pr-1">
          {loading ? (
            <div className="flex h-full min-h-48 items-center justify-center text-sm text-[var(--glass-text-secondary)]">
              <AppIcon name="loader" className="mr-2 h-5 w-5 animate-spin" />{t('mobileCloudPicker.loading')}
            </div>
          ) : assets.length === 0 ? (
            <div className="flex h-full min-h-48 flex-col items-center justify-center text-center text-[var(--glass-text-secondary)]">
              <AppIcon name="folderOpen" className="mb-3 h-10 w-10 text-[var(--glass-text-tertiary)]" />
              <p className="text-sm font-medium">{t('mobileCloudPicker.empty')}</p>
              <p className="mt-1 text-xs text-[var(--glass-text-tertiary)]">{t('mobileCloudPicker.emptyHint')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {assets.map((asset) => {
                const isSelected = selected.has(asset.assetId)
                const atLimit = multiple && selected.size >= maxSelection && !isSelected
                return (
                  <button
                    key={asset.assetId}
                    type="button"
                    disabled={atLimit}
                    onClick={() => toggleAsset(asset)}
                    className={`group overflow-hidden rounded-2xl border text-left transition ${isSelected ? 'border-[var(--glass-stroke-focus)] ring-2 ring-[var(--glass-stroke-focus)]/20' : 'border-[var(--glass-stroke-base)] hover:border-[var(--glass-stroke-strong)]'} disabled:cursor-not-allowed disabled:opacity-45`}
                  >
                    <div className="relative aspect-square bg-[var(--glass-bg-muted)]">
                      <Image src={asset.assetUrl} alt={asset.assetName} fill unoptimized className="object-cover" />
                      {isSelected ? (
                        <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--glass-accent-from)] text-white shadow">
                          <AppIcon name="check" className="h-4 w-4" />
                        </span>
                      ) : null}
                    </div>
                    <div className="px-2.5 py-2">
                      <p className="truncate text-xs font-medium text-[var(--glass-text-primary)]" title={asset.assetName}>{asset.assetName}</p>
                      <p className="mt-0.5 truncate text-[11px] text-[var(--glass-text-tertiary)]">{groupNames.get(asset.groupId) || asset.groupId}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between text-xs text-[var(--glass-text-tertiary)]">
          <span>{t('mobileCloudPicker.total', { total })}</span>
          <div className="flex items-center gap-2">
            <button type="button" disabled={pageNo <= 1 || loading} onClick={() => setPageNo((value) => value - 1)} className="glass-btn-base glass-btn-ghost h-8 w-8 disabled:opacity-35">
              <AppIcon name="chevronLeft" className="h-4 w-4" />
            </button>
            <span>{pageNo}/{totalPages}</span>
            <button type="button" disabled={pageNo >= totalPages || loading} onClick={() => setPageNo((value) => value + 1)} className="glass-btn-base glass-btn-ghost h-8 w-8 disabled:opacity-35">
              <AppIcon name="chevronRight" className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </GlassModalShell>
  )
}
