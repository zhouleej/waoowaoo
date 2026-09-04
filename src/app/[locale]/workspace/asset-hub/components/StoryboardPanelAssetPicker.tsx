'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { apiFetch } from '@/lib/api-fetch'
import { AppIcon } from '@/components/ui/icons'
import { MediaImageWithLoading } from '@/components/media/MediaImageWithLoading'

const MAX_PANEL_SELECTION = 20

type ProjectOption = {
  id: string
  name: string
}

type EpisodeOption = {
  id: string
  episodeNumber: number
  name: string
}

type StoryboardPanel = {
  id: string
  panelIndex: number
  panelNumber: number | null
  description: string | null
  imageUrl: string | null
  mobileCloudAssetId?: string | null
  mobileCloudAssetStatus?: string | null
}

type Storyboard = {
  id: string
  panels: StoryboardPanel[]
}

function errorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') return fallback
  const error = (payload as { error?: unknown }).error
  if (!error || typeof error !== 'object') return fallback
  const message = (error as { message?: unknown }).message
  return typeof message === 'string' && message.trim() ? message : fallback
}

async function readJson<T>(response: Response, fallback: string): Promise<T> {
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new Error(errorMessage(payload, fallback))
  return payload as T
}

export function StoryboardPanelAssetPicker({
  groupId,
  onClose,
  onUploaded,
}: {
  groupId: string
  onClose: () => void
  onUploaded: () => Promise<void> | void
}) {
  const t = useTranslations('assetHub.mobileCloud')
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [episodes, setEpisodes] = useState<EpisodeOption[]>([])
  const [panels, setPanels] = useState<StoryboardPanel[]>([])
  const [projectId, setProjectId] = useState('')
  const [episodeId, setEpisodeId] = useState('')
  const [selectedPanelIds, setSelectedPanelIds] = useState<Set<string>>(new Set())
  const [loadingProjects, setLoadingProjects] = useState(true)
  const [loadingEpisodes, setLoadingEpisodes] = useState(false)
  const [loadingPanels, setLoadingPanels] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  const loadProjects = useCallback(async () => {
    setLoadingProjects(true)
    setError('')
    try {
      const payload = await readJson<{ projects?: ProjectOption[] }>(
        await apiFetch('/api/projects?page=1&pageSize=100'),
        t('requestFailed'),
      )
      const nextProjects = Array.isArray(payload.projects) ? payload.projects : []
      setProjects(nextProjects)
      setProjectId((current) => nextProjects.some((project) => project.id === current) ? current : nextProjects[0]?.id || '')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('requestFailed'))
      setProjects([])
    } finally {
      setLoadingProjects(false)
    }
  }, [t])

  const loadEpisodes = useCallback(async (nextProjectId: string) => {
    if (!nextProjectId) {
      setEpisodes([])
      setEpisodeId('')
      return
    }
    setLoadingEpisodes(true)
    setError('')
    try {
      const payload = await readJson<{ episodes?: EpisodeOption[] }>(
        await apiFetch(`/api/novel-promotion/${encodeURIComponent(nextProjectId)}/episodes`),
        t('requestFailed'),
      )
      const nextEpisodes = Array.isArray(payload.episodes) ? payload.episodes : []
      setEpisodes(nextEpisodes)
      setEpisodeId((current) => nextEpisodes.some((episode) => episode.id === current) ? current : nextEpisodes[0]?.id || '')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('requestFailed'))
      setEpisodes([])
      setEpisodeId('')
    } finally {
      setLoadingEpisodes(false)
    }
  }, [t])

  const loadPanels = useCallback(async (nextProjectId: string, nextEpisodeId: string) => {
    if (!nextProjectId || !nextEpisodeId) {
      setPanels([])
      setSelectedPanelIds(new Set())
      return
    }
    setLoadingPanels(true)
    setError('')
    try {
      const payload = await readJson<{ storyboards?: Storyboard[] }>(
        await apiFetch(`/api/novel-promotion/${encodeURIComponent(nextProjectId)}/storyboards?episodeId=${encodeURIComponent(nextEpisodeId)}`),
        t('requestFailed'),
      )
      const nextPanels = (payload.storyboards || []).flatMap((storyboard) => storyboard.panels || [])
        .filter((panel) => !!panel.imageUrl)
        .sort((left, right) => left.panelIndex - right.panelIndex)
      setPanels(nextPanels)
      setSelectedPanelIds(new Set())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('requestFailed'))
      setPanels([])
      setSelectedPanelIds(new Set())
    } finally {
      setLoadingPanels(false)
    }
  }, [t])

  useEffect(() => {
    void loadProjects()
  }, [loadProjects])

  useEffect(() => {
    void loadEpisodes(projectId)
  }, [projectId, loadEpisodes])

  useEffect(() => {
    void loadPanels(projectId, episodeId)
  }, [projectId, episodeId, loadPanels])

  const selectedCount = selectedPanelIds.size
  const canUpload = !!groupId && !!projectId && !!episodeId && selectedCount > 0 && !uploading

  const allSelectablePanels = useMemo(() => panels.slice(0, MAX_PANEL_SELECTION), [panels])
  const togglePanel = (panelId: string) => {
    setSelectedPanelIds((current) => {
      const next = new Set(current)
      if (next.has(panelId)) {
        next.delete(panelId)
      } else if (next.size < MAX_PANEL_SELECTION) {
        next.add(panelId)
      }
      return next
    })
  }

  const selectAll = () => {
    setSelectedPanelIds(new Set(allSelectablePanels.map((panel) => panel.id)))
  }

  const upload = async () => {
    if (!canUpload) return
    setUploading(true)
    setError('')
    try {
      await readJson(
        await apiFetch('/api/asset-hub/mobile-cloud', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            resource: 'storyboard-panel-assets',
            projectId,
            episodeId,
            groupId,
            panelIds: Array.from(selectedPanelIds),
          }),
        }),
        t('requestFailed'),
      )
      await onUploaded()
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('requestFailed'))
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label={t('storyboardPickerTitle')}>
      <div className="glass-surface-modal flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden">
        <div className="flex items-start justify-between gap-4 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-[var(--glass-text-primary)]">{t('storyboardPickerTitle')}</h2>
            <p className="mt-1 text-xs text-[var(--glass-text-secondary)]">{t('storyboardPickerHint')}</p>
          </div>
          <button type="button" onClick={onClose} disabled={uploading} className="glass-btn-base glass-btn-soft text-[var(--glass-text-tertiary)]" aria-label={t('pickerCancel')}>
            <AppIcon name="close" className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-3 border-y border-[var(--glass-border-subtle)] px-6 py-4 md:grid-cols-2">
          <label className="space-y-1.5 text-xs text-[var(--glass-text-secondary)]">
            <span>{t('storyboardProject')}</span>
            <select
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
              disabled={loadingProjects || uploading || projects.length === 0}
              className="glass-input w-full text-sm"
            >
              {projects.length === 0 && <option value="">{t('storyboardNoProjects')}</option>}
              {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
          </label>
          <label className="space-y-1.5 text-xs text-[var(--glass-text-secondary)]">
            <span>{t('storyboardEpisode')}</span>
            <select
              value={episodeId}
              onChange={(event) => setEpisodeId(event.target.value)}
              disabled={!projectId || loadingEpisodes || uploading || episodes.length === 0}
              className="glass-input w-full text-sm"
            >
              {episodes.length === 0 && <option value="">{t('storyboardNoEpisodes')}</option>}
              {episodes.map((episode) => <option key={episode.id} value={episode.id}>{t('storyboardEpisodeLabel', { number: episode.episodeNumber, name: episode.name })}</option>)}
            </select>
          </label>
        </div>

        {error && <p className="mx-6 mt-4 rounded-lg bg-[var(--glass-tone-danger-bg)] px-3 py-2 text-xs text-[var(--glass-tone-danger-fg)]">{error}</p>}

        <div className="flex items-center justify-between gap-3 px-6 py-3">
          <span className="text-xs text-[var(--glass-text-secondary)]">{t('storyboardSelectedCount', { count: selectedCount, max: MAX_PANEL_SELECTION })}</span>
          <button type="button" onClick={selectAll} disabled={uploading || allSelectablePanels.length === 0} className="glass-btn-base rounded-lg px-3 py-1.5 text-xs">
            {t('storyboardSelectAll')}
          </button>
        </div>

        <div className="app-scrollbar min-h-[260px] flex-1 overflow-y-auto px-6 pb-5">
          {loadingProjects || loadingEpisodes || loadingPanels ? (
            <div className="flex h-48 items-center justify-center"><span className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--glass-stroke-strong)] border-t-[var(--glass-tone-info-fg)]" /></div>
          ) : panels.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center text-[var(--glass-text-tertiary)]">
              <AppIcon name="image" className="mb-2 h-12 w-12" />
              <p className="text-sm">{t('storyboardNoPanels')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {panels.map((panel) => {
                const selected = selectedPanelIds.has(panel.id)
                const isLimitReached = !selected && selectedCount >= MAX_PANEL_SELECTION
                const label = t('storyboardPanelLabel', { number: panel.panelNumber ?? panel.panelIndex + 1 })
                return (
                  <button
                    key={panel.id}
                    type="button"
                    onClick={() => togglePanel(panel.id)}
                    disabled={uploading || isLimitReached}
                    className={`relative overflow-hidden rounded-xl border-2 p-2 text-left transition ${selected ? 'border-[var(--glass-stroke-focus)] bg-[var(--glass-tone-info-bg)]' : 'border-[var(--glass-stroke-base)] hover:border-[var(--glass-stroke-focus)]'} disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    {selected && <AppIcon name="badgeCheck" className="absolute right-1 top-1 z-10 h-5 w-5 rounded-full bg-[var(--glass-bg-surface)] text-[var(--glass-tone-info-fg)]" />}
                    <div className="relative aspect-[16/10] overflow-hidden rounded-lg bg-[var(--glass-bg-muted)]">
                      {panel.imageUrl ? <MediaImageWithLoading src={panel.imageUrl} alt={label} containerClassName="h-full w-full" className="h-full w-full object-cover" /> : null}
                    </div>
                    <p className="mt-2 truncate text-xs font-medium text-[var(--glass-text-primary)]">{label}</p>
                    <p className="mt-0.5 line-clamp-2 min-h-8 text-[10px] leading-4 text-[var(--glass-text-tertiary)]">{panel.description || t('storyboardPanelNoDescription')}</p>
                    {panel.mobileCloudAssetId && <span className="mt-1 inline-flex rounded bg-[var(--glass-tone-info-bg)] px-1.5 py-0.5 text-[10px] text-[var(--glass-tone-info-fg)]">{panel.mobileCloudAssetStatus === 'ACTIVE' ? t('storyboardAssetActive') : t('storyboardAssetPending')}</span>}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface-strong)] px-6 py-4">
          <button type="button" onClick={onClose} disabled={uploading} className="glass-btn-base glass-btn-secondary px-4 py-2 text-sm">{t('pickerCancel')}</button>
          <button type="button" onClick={() => void upload()} disabled={!canUpload} className="glass-btn-base glass-btn-primary flex items-center gap-2 rounded-lg px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50">
            {uploading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
            {uploading ? t('storyboardUploading') : t('storyboardUpload')}
          </button>
        </div>
      </div>
    </div>
  )
}

export function StoryboardPanelAssetUploader({
  groupId,
  onUploaded,
}: {
  groupId: string
  onUploaded: () => Promise<void> | void
}) {
  const t = useTranslations('assetHub.mobileCloud')
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="glass-btn-base rounded-lg px-3 py-1.5 text-xs"
      >
        <AppIcon name="image" className="mr-1 inline h-3 w-3" />
        {t('pickStoryboardPanels')}
      </button>
      {open && (
        <StoryboardPanelAssetPicker
          groupId={groupId}
          onClose={() => setOpen(false)}
          onUploaded={onUploaded}
        />
      )}
    </>
  )
}
