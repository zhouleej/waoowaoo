'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { apiFetch } from '@/lib/api-fetch'
import { readApiErrorMessage } from '@/lib/api/read-error-message'
import type { DiscoveredModel, DiscoveredModelType, ModelDiscoveryResult } from '@/lib/user-api/model-discovery'
import { buildDiscoveryImportPlan } from '../discovery-import'
import type { ProviderCardProps, ProviderCardTranslator } from './types'

interface ModelDiscoveryPanelProps {
  provider: ProviderCardProps['provider']
  allModels: NonNullable<ProviderCardProps['allModels']>
  onAddModels: NonNullable<ProviderCardProps['onAddModels']>
  t: ProviderCardTranslator
}

const TYPES: DiscoveredModelType[] = ['llm', 'image', 'video', 'audio']

export function ModelDiscoveryPanel({ provider, allModels, onAddModels, t }: ModelDiscoveryPanelProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ModelDiscoveryResult | null>(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | DiscoveredModelType>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [types, setTypes] = useState<Record<string, DiscoveredModelType>>({})
  const [importSummary, setImportSummary] = useState('')
  const existing = useMemo(() => new Set(allModels.filter((model) => model.provider === provider.id).map((model) => model.modelId)), [allModels, provider.id])
  const visible = useMemo(() => (result?.models ?? []).filter((model) => {
    const matchesQuery = `${model.id} ${model.name ?? ''}`.toLowerCase().includes(query.trim().toLowerCase())
    return matchesQuery && (filter === 'all' || (types[model.id] ?? model.suggestedType) === filter)
  }), [filter, query, result, types])

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  const load = async (forceRefresh = false) => {
    setLoading(true)
    setError('')
    setImportSummary('')
    try {
      const response = await apiFetch('/api/user/api-config/discover-models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId: provider.id, forceRefresh }),
      })
      if (!response.ok) throw new Error(await readApiErrorMessage(response, t('discoveryErrorUnknown')))
      const payload = await response.json() as ModelDiscoveryResult
      setResult(payload)
      setTypes(Object.fromEntries(payload.models.map((model) => [model.id, model.suggestedType])))
      setSelected(new Set(payload.models.filter((model) => !existing.has(model.id)).map((model) => model.id)))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('discoveryErrorUnknown'))
    } finally {
      setLoading(false)
    }
  }

  const show = () => {
    setOpen(true)
    if (!result) void load()
  }

  const toggleVisible = () => {
    const selectable = visible.filter((model) => !existing.has(model.id)).map((model) => model.id)
    const allSelected = selectable.length > 0 && selectable.every((id) => selected.has(id))
    setSelected((current) => {
      const next = new Set(current)
      selectable.forEach((id) => allSelected ? next.delete(id) : next.add(id))
      return next
    })
  }

  const importSelected = async () => {
    if (!result) return
    const plan = buildDiscoveryImportPlan({
      providerId: provider.id,
      existingModels: allModels,
      selections: result.models
        .filter((model) => selected.has(model.id))
        .map((model) => ({ model, type: types[model.id] ?? model.suggestedType })),
    })
    if (!plan.additions.length) {
      setImportSummary(t('discoveryNothingToImport'))
      return
    }
    setImporting(true)
    const saved = await onAddModels(plan.additions)
    setImporting(false)
    setImportSummary(saved ? t('discoveryImported', { count: plan.additions.length }) : t('discoveryImportFailed'))
    if (saved) setSelected(new Set())
  }

  const dialog = open && typeof document !== 'undefined' ? createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('discoveryTitle')}
      className="fixed inset-0 z-[200] flex items-center justify-center overflow-hidden p-3 sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setOpen(false)
      }}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" aria-hidden="true" />
      <section className="glass-surface-modal relative z-10 flex max-h-[calc(100dvh-1.5rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl shadow-2xl sm:max-h-[calc(100dvh-3rem)]">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-[var(--glass-stroke-base)] px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-[var(--glass-text-primary)]">{t('discoveryTitle')}</h3>
            <p className="mt-1 truncate text-xs text-[var(--glass-text-tertiary)]">{provider.name}</p>
            {result ? (
              <p className="mt-1 text-xs text-[var(--glass-text-tertiary)]">
                {t('discoveredAt', { time: new Date(result.discoveredAt).toLocaleString() })}
                {result.cacheHit ? ` · ${t('discoveryCacheHit')}` : ''}
              </p>
            ) : null}
          </div>
          <button type="button" onClick={() => setOpen(false)} className="glass-btn-base glass-btn-ghost h-9 w-9 shrink-0 text-xl" aria-label={t('close')}>×</button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col px-4 py-4 sm:px-6">
          <div className="grid shrink-0 gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_auto]">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('discoverySearch')} className="glass-input-base w-full px-3 py-2 text-sm" />
            <select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)} className="glass-input-base w-full px-2 py-2 text-sm">
              <option value="all">{t('discoveryAllTypes')}</option>
              {TYPES.map((type) => <option key={type} value={type}>{t(`modelType.${type}`)}</option>)}
            </select>
            <button type="button" onClick={() => void load(true)} disabled={loading} className="glass-btn-base glass-btn-secondary px-3 py-2 text-xs disabled:opacity-50">{t('forceRefresh')}</button>
          </div>

          {error ? <div className="mt-3 shrink-0 rounded-xl bg-red-500/10 p-3 text-sm text-red-500">{error}</div> : null}
          {result?.warnings.length ? <div className="mt-3 shrink-0 rounded-xl bg-yellow-500/10 p-3 text-xs">{t('discoveryPartialWarning')} ({result.warnings.join(', ')})</div> : null}

          {loading ? (
            <div className="flex min-h-56 flex-1 items-center justify-center text-sm text-[var(--glass-text-secondary)]">{t('discoveryLoading')}</div>
          ) : result ? (
            <>
              <div className="mt-4 flex shrink-0 items-center justify-between gap-3 text-xs text-[var(--glass-text-secondary)]">
                <button type="button" onClick={toggleVisible} className="font-medium text-[var(--glass-text-primary)] underline underline-offset-4">{t('discoveryToggleVisible')}</button>
                <div className="flex items-center gap-3">
                  <span>{visible.length} / {result.models.length}</span>
                  <span>{t('discoverySelectedCount', { count: selected.size })}</span>
                </div>
              </div>

              <div className="mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)]">
                {visible.map((model: DiscoveredModel) => (
                  <label key={model.id} className="grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] items-center gap-3 border-b border-[var(--glass-stroke-base)] p-3 last:border-0 hover:bg-[var(--glass-bg-muted)] sm:grid-cols-[auto_minmax(0,1fr)_9rem]">
                    <input type="checkbox" disabled={existing.has(model.id)} checked={selected.has(model.id)} onChange={() => setSelected((current) => {
                      const next = new Set(current)
                      if (next.has(model.id)) next.delete(model.id)
                      else next.add(model.id)
                      return next
                    })} />
                    <span className="min-w-0">
                      <span className="block break-all font-mono text-xs text-[var(--glass-text-primary)]">{model.id}</span>
                      {model.name && model.name !== model.id ? <span className="mt-0.5 block truncate text-xs text-[var(--glass-text-secondary)]">{model.name}</span> : null}
                      <span className="mt-1 block text-[11px] text-[var(--glass-text-tertiary)]">{existing.has(model.id) ? t('discoveryAlreadyImported') : `${t('discoverySuggestion')} · ${t(`confidence.${model.confidence}`)}`}</span>
                    </span>
                    <select disabled={existing.has(model.id)} value={types[model.id] ?? model.suggestedType} onChange={(event) => setTypes((current) => ({ ...current, [model.id]: event.target.value as DiscoveredModelType }))} className="glass-input-base col-start-2 w-full px-2 py-1.5 text-xs sm:col-start-3 sm:row-start-1">
                      {TYPES.map((type) => <option key={type} value={type}>{t(`modelType.${type}`)}</option>)}
                    </select>
                  </label>
                ))}
                {visible.length === 0 ? <div className="flex min-h-40 items-center justify-center p-6 text-sm text-[var(--glass-text-tertiary)]">{t('discoveryNothingToImport')}</div> : null}
              </div>
            </>
          ) : null}
        </div>

        <footer className="flex shrink-0 flex-col gap-3 border-t border-[var(--glass-stroke-base)] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span className="min-h-5 text-xs text-[var(--glass-text-secondary)]">{importSummary}</span>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="glass-btn-base glass-btn-secondary px-4 py-2 text-sm">{t('close')}</button>
            <button type="button" onClick={() => void importSelected()} disabled={loading || importing || selected.size === 0} className="glass-btn-base glass-btn-primary px-4 py-2 text-sm disabled:opacity-50">{importing ? t('discoveryImporting') : t('discoveryImportSelected')}</button>
          </div>
        </footer>
      </section>
    </div>,
    document.body,
  ) : null

  return (
    <div className="px-3.5 pb-2.5">
      <button type="button" onClick={show} disabled={!provider.hasApiKey || !provider.baseUrl} className="glass-btn-base glass-btn-secondary px-3 py-1.5 text-xs disabled:opacity-50">
        {t('discoverModels')}
      </button>
      {dialog}
    </div>
  )
}
