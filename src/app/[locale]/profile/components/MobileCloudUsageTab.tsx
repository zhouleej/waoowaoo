'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'
import type { MobileCloudUsageData, MobileCloudUsageTrendPoint } from '@/lib/mobile-cloud-maas/types'
import { buildUsageChartPoints, getUsageDatePreset, normalizeUsagePage } from './mobile-cloud-usage'

interface UsageApiResponse {
  success: true
  data: MobileCloudUsageData
  diagnostics?: { configured: boolean }
}

interface UsageApiError {
  error?: { message?: string }
  diagnostics?: { missing?: string[]; action?: string }
}

function UsageTrendChart({ trend, formatTokens }: {
  trend: MobileCloudUsageTrendPoint[]
  formatTokens: (value: number) => string
}) {
  const points = buildUsageChartPoints(trend, Math.max(1, trend.length - 1), 100, 0)
  return (
    <div className="min-h-56 w-full overflow-x-auto rounded-2xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)]/45 p-3 sm:p-4">
      <div className="flex h-52 items-end gap-1 border-b border-[var(--glass-stroke-base)] px-1 pt-3" role="img" style={{ minWidth: `${Math.max(100, trend.length * 6)}px` }}>
        {points.map((point, index) => (
          <div key={`${trend[index].date}-${trend[index].totalTokens}`} className="group relative flex h-full min-w-0 flex-1 items-end" title={`${trend[index].date}: ${formatTokens(trend[index].totalTokens)}`}>
            <div className="w-full min-w-1 rounded-t-sm bg-[var(--glass-tone-info-fg)] opacity-75 transition-opacity group-hover:opacity-100" style={{ height: `${Math.max(2, 100 - point.y)}%` }} />
          </div>
        ))}
      </div>
      {trend.length > 0 && <div className="flex justify-between px-2 text-xs text-[var(--glass-text-tertiary)]"><span>{trend[0].date}</span><span>{trend[trend.length - 1].date}</span></div>}
    </div>
  )
}

export default function MobileCloudUsageTab() {
  const t = useTranslations('profile.mobileCloud')
  const locale = useLocale()
  const initialRange = useMemo(() => getUsageDatePreset(30), [])
  const [beginDate, setBeginDate] = useState(initialRange.beginDate)
  const [endDate, setEndDate] = useState(initialRange.endDate)
  const [appliedRange, setAppliedRange] = useState(initialRange)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [ramNameInput, setRamNameInput] = useState('')
  const [ramName, setRamName] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [data, setData] = useState<MobileCloudUsageData | null>(null)
  const [adminConfigured, setAdminConfigured] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [diagnostics, setDiagnostics] = useState<string[]>([])
  const [reloadKey, setReloadKey] = useState(0)
  const [exporting, setExporting] = useState(false)
  const [exportUrls, setExportUrls] = useState<string[]>([])
  const [exportError, setExportError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      setLoading(true)
      setError(null)
      setDiagnostics([])
      const params = new URLSearchParams({
        beginDate: appliedRange.beginDate,
        endDate: appliedRange.endDate,
        apiKey,
        ramName,
        page: String(page),
        pageSize: String(pageSize),
      })
      try {
        const response = await fetch(`/api/user/mobile-cloud-usage?${params}`, { signal: controller.signal })
        const payload = await response.json() as UsageApiResponse | UsageApiError
        if (!response.ok || !('success' in payload) || payload.success !== true) {
          const failed = payload as UsageApiError
          setDiagnostics(failed.diagnostics?.missing ?? [])
          throw new Error(failed.error?.message || t('loadFailed'))
        }
        setData(payload.data)
        setAdminConfigured(payload.diagnostics?.configured ?? null)
        if (payload.data.pagination.page !== page) setPage(payload.data.pagination.page)
      } catch (loadError) {
        if (loadError instanceof DOMException && loadError.name === 'AbortError') return
        setError(loadError instanceof Error ? loadError.message : t('loadFailed'))
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void load()
    return () => controller.abort()
  }, [appliedRange, apiKey, ramName, page, pageSize, reloadKey, t])

  const formatTokens = (value: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value)
  const totalPages = data?.pagination.totalPages ?? 1

  const applyPreset = (days: number) => {
    const range = getUsageDatePreset(days)
    setBeginDate(range.beginDate)
    setEndDate(range.endDate)
    setAppliedRange(range)
    setPage(1)
  }

  const applyFilters = (event: FormEvent) => {
    event.preventDefault()
    setAppliedRange({ beginDate, endDate })
    setApiKey(apiKeyInput.trim())
    setRamName(ramNameInput.trim())
    setPage(1)
  }

  const startExport = async () => {
    setExporting(true)
    setExportUrls([])
    setExportError(null)
    try {
      const response = await fetch('/api/user/mobile-cloud-usage/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ beginDate: appliedRange.beginDate, endDate: appliedRange.endDate, apiKey, ramName }),
      })
      const payload = await response.json() as { success?: boolean; data?: { taskIds: string[] }; error?: { message?: string } }
      if (!response.ok || !payload.success || !payload.data?.taskIds?.length) throw new Error(payload.error?.message || t('exportFailed'))
      for (let attempt = 0; attempt < 30; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 2000))
        const statusResponse = await fetch('/api/user/mobile-cloud-usage/export/status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskIds: payload.data.taskIds }),
        })
        const status = await statusResponse.json() as { success?: boolean; data?: { status: string; downloadUrls?: string[]; errorMessage?: string } }
        if (!status.success || !status.data) throw new Error(t('exportFailed'))
        if (status.data.status === 'SUCCESS' && status.data.downloadUrls?.length) {
          setExportUrls(status.data.downloadUrls)
          return
        }
        if (status.data.status === 'FAILED') throw new Error(status.data.errorMessage || t('exportFailed'))
      }
      throw new Error(t('exportTimeout'))
    } catch (cause) {
      setExportError(cause instanceof Error ? cause.message : t('exportFailed'))
    } finally {
      setExporting(false)
    }
  }

  const summaryCards = data ? [
    { label: t('totalTokens'), value: formatTokens(data.summary.totalTokens), tone: 'text-[var(--glass-text-primary)]' },
    { label: t('costAmount'), value: formatTokens(data.summary.costAmount), tone: 'text-[var(--glass-tone-warning-fg)]' },
    { label: t('videoInputTokens'), value: formatTokens(data.summary.videoInputTokens), tone: 'text-[var(--glass-tone-success-fg)]' },
    { label: t('noVideoInputTokens'), value: formatTokens(data.summary.noVideoInputTokens), tone: 'text-[var(--glass-tone-info-fg)]' },
  ] : []

  return (
    <section className="flex min-h-0 flex-1 flex-col p-4 sm:p-6" aria-labelledby="mobile-cloud-title">
      <div className="flex flex-col gap-3 border-b border-[var(--glass-stroke-base)] pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 id="mobile-cloud-title" className="text-xl font-semibold text-[var(--glass-text-primary)]">{t('title')}</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--glass-text-tertiary)]">{t('description')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {adminConfigured !== null && <span className="rounded-full border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)] px-3 py-1.5 text-[var(--glass-text-secondary)]">{adminConfigured ? t('configured') : t('notConfigured')}</span>}
          <button type="button" onClick={startExport} disabled={exporting || !data} className="glass-btn-base glass-btn-tone-info inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs"><AppIcon name="download" className="h-3.5 w-3.5" />{exporting ? t('exporting') : t('export')}</button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-5">
        {exportError && <div className="mb-4 rounded-xl border border-[var(--glass-tone-danger-border)] bg-[var(--glass-tone-danger-bg)] px-4 py-3 text-sm text-[var(--glass-tone-danger-fg)]" role="alert">{exportError}</div>}
        {exportUrls.length > 0 && <div className="mb-4 flex flex-col gap-2 rounded-xl border border-[var(--glass-tone-success-border)] bg-[var(--glass-tone-success-bg)] px-4 py-3 text-sm text-[var(--glass-tone-success-fg)]">{exportUrls.map((url, index) => <a key={url} href={url} target="_blank" rel="noreferrer" className="underline">{exportUrls.length === 1 ? t('downloadExport') : t('downloadExportPart', { number: index + 1 })}</a>)}</div>}
        {loading && !data ? (
          <div className="flex min-h-72 items-center justify-center gap-3 text-sm text-[var(--glass-text-secondary)]" role="status"><AppIcon name="loader" className="h-5 w-5 animate-spin" />{t('loading')}</div>
        ) : error ? (
          <div className="flex min-h-72 flex-col items-center justify-center gap-4 px-4 text-center" role="alert"><AppIcon name="cloudUpload" className="h-10 w-10 text-[var(--glass-text-tertiary)]" /><div><p className="text-sm font-medium text-[var(--glass-text-primary)]">{error}</p>{diagnostics.length > 0 && <p className="mt-2 max-w-xl break-words text-xs text-[var(--glass-text-tertiary)]">{t('missingConfig')}: {diagnostics.join(', ')}</p>}</div><button type="button" onClick={() => setReloadKey((value) => value + 1)} className="glass-btn-base glass-btn-tone-info rounded-xl px-4 py-2 text-sm">{t('retry')}</button></div>
        ) : data ? (
          <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{summaryCards.map((card) => <div key={card.label} className="glass-surface-soft rounded-2xl border border-[var(--glass-stroke-base)] p-4"><div className="text-xs font-medium text-[var(--glass-text-tertiary)]">{card.label}</div><div className={`mt-2 truncate text-xl font-semibold tabular-nums ${card.tone}`} title={card.value}>{card.value}</div></div>)}</div>

          <div className="glass-surface-soft rounded-2xl border border-[var(--glass-stroke-base)] p-4"><div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold text-[var(--glass-text-primary)]">{t('pricingTitle')}</h2><p className="mt-1 text-xs text-[var(--glass-text-tertiary)]">{t('pricingDescription')}</p></div><AppIcon name="coins" className="h-5 w-5 text-[var(--glass-tone-warning-fg)]" /></div><div className="mt-4 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4"><div className="rounded-xl bg-[var(--glass-bg-muted)] p-3">{t('withVideo')}<strong className="mt-1 block text-sm text-[var(--glass-text-primary)]">¥56 / {t('millionTokens')}</strong></div><div className="rounded-xl bg-[var(--glass-bg-muted)] p-3">{t('withoutVideo')}<strong className="mt-1 block text-sm text-[var(--glass-text-primary)]">¥92 / {t('millionTokens')}</strong></div><div className="rounded-xl bg-[var(--glass-bg-muted)] p-3">{t('withVideo1080')}<strong className="mt-1 block text-sm text-[var(--glass-text-primary)]">¥62 / {t('millionTokens')}</strong></div><div className="rounded-xl bg-[var(--glass-bg-muted)] p-3">{t('withoutVideo1080')}<strong className="mt-1 block text-sm text-[var(--glass-text-primary)]">¥102 / {t('millionTokens')}</strong></div></div></div>

          <form onSubmit={applyFilters} className="glass-surface-soft rounded-2xl border border-[var(--glass-stroke-base)] p-4"><div className="flex flex-col gap-3 xl:flex-row xl:items-end"><div className="flex flex-wrap gap-2">{[7, 30, 90].map((days) => <button key={days} type="button" onClick={() => applyPreset(days)} className="glass-btn-base rounded-xl px-3 py-2 text-sm text-[var(--glass-text-secondary)] hover:text-[var(--glass-text-primary)]">{t('days', { days })}</button>)}</div><label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-[var(--glass-text-tertiary)]">{t('beginDate')}<input type="date" value={beginDate} max={endDate} onChange={(event) => setBeginDate(event.target.value)} className="glass-input h-10 rounded-xl px-3 text-sm text-[var(--glass-text-primary)]" required /></label><label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-[var(--glass-text-tertiary)]">{t('endDate')}<input type="date" value={endDate} min={beginDate} onChange={(event) => setEndDate(event.target.value)} className="glass-input h-10 rounded-xl px-3 text-sm text-[var(--glass-text-primary)]" required /></label><label className="flex min-w-0 flex-[1.2] flex-col gap-1 text-xs text-[var(--glass-text-tertiary)]">{t('apiKeyFilter')}<input value={apiKeyInput} onChange={(event) => setApiKeyInput(event.target.value)} maxLength={200} placeholder={t('apiKeyPlaceholder')} className="glass-input h-10 rounded-xl px-3 text-sm text-[var(--glass-text-primary)]" /></label><label className="flex min-w-0 flex-[1.2] flex-col gap-1 text-xs text-[var(--glass-text-tertiary)]">{t('ramFilter')}<input value={ramNameInput} onChange={(event) => setRamNameInput(event.target.value)} maxLength={200} placeholder={t('ramPlaceholder')} className="glass-input h-10 rounded-xl px-3 text-sm text-[var(--glass-text-primary)]" /></label><button type="submit" className="glass-btn-base glass-btn-tone-info h-10 rounded-xl px-5 text-sm font-medium">{t('query')}</button></div></form>

          <div className="glass-surface-soft rounded-2xl border border-[var(--glass-stroke-base)] p-4 sm:p-5"><div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="font-semibold text-[var(--glass-text-primary)]">{t('trendTitle')}</h2><p className="mt-1 text-xs text-[var(--glass-text-tertiary)]">{t('trendDescription')}</p></div><AppIcon name="chart" className="h-5 w-5 text-[var(--glass-tone-info-fg)]" /></div>{data.trend.length ? <UsageTrendChart trend={data.trend} formatTokens={formatTokens} /> : <div className="flex min-h-56 items-center justify-center text-sm text-[var(--glass-text-tertiary)]">{t('noUsage')}</div>}</div>

          <div className="glass-surface-soft overflow-hidden rounded-2xl border border-[var(--glass-stroke-base)]"><div className="flex items-center justify-between border-b border-[var(--glass-stroke-base)] px-4 py-3"><div><h2 className="font-semibold text-[var(--glass-text-primary)]">{t('detailsTitle')}</h2><p className="mt-1 text-xs text-[var(--glass-text-tertiary)]">{data.modelName}</p></div><select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1) }} className="glass-input rounded-lg px-2 py-1.5 text-xs text-[var(--glass-text-secondary)]">{[10, 20, 50].map((size) => <option key={size} value={size}>{t('perPage', { count: size })}</option>)}</select></div>{!data.rows.length ? <div className="flex min-h-40 items-center justify-center text-sm text-[var(--glass-text-tertiary)]">{t('noUsage')}</div> : <><div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[900px] table-fixed text-left text-sm"><thead className="text-xs text-[var(--glass-text-tertiary)]"><tr className="border-b border-[var(--glass-stroke-base)]"><th className="w-[20%] px-4 py-3 font-medium">{t('time')}</th><th className="w-[20%] px-4 py-3 font-medium">{t('task')}</th><th className="w-[15%] px-4 py-3 text-right font-medium">{t('totalTokens')}</th><th className="w-[15%] px-4 py-3 text-right font-medium">{t('videoInputTokens')}</th><th className="w-[15%] px-4 py-3 text-right font-medium">{t('noVideoInputTokens')}</th><th className="w-[15%] px-4 py-3 text-right font-medium">{t('costAmount')}</th></tr></thead><tbody>{data.rows.map((row) => <tr key={`${row.taskId}-${row.deductTime}`} className="border-b border-[var(--glass-stroke-base)]/70 last:border-0"><td className="px-4 py-3 text-[var(--glass-text-secondary)]">{row.deductTime}</td><td className="break-all px-4 py-3 text-[var(--glass-text-primary)]">{row.taskId}</td><td className="px-4 py-3 text-right tabular-nums text-[var(--glass-text-secondary)]">{formatTokens(row.totalTokens)}</td><td className="px-4 py-3 text-right tabular-nums text-[var(--glass-text-secondary)]">{formatTokens(row.videoInputTokens)}</td><td className="px-4 py-3 text-right tabular-nums text-[var(--glass-text-secondary)]">{formatTokens(row.noVideoInputTokens)}</td><td className="px-4 py-3 text-right tabular-nums text-[var(--glass-tone-info-fg)]">{formatTokens(row.costAmount)}</td></tr>)}</tbody></table></div><div className="space-y-3 p-3 md:hidden">{data.rows.map((row) => <article key={`${row.taskId}-${row.deductTime}`} className="rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)]/45 p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-all text-sm font-medium text-[var(--glass-text-primary)]">{row.taskId}</h3><p className="mt-1 text-xs text-[var(--glass-text-tertiary)]">{row.deductTime}</p></div><span className="shrink-0 text-sm font-semibold tabular-nums text-[var(--glass-tone-info-fg)]">{formatTokens(row.costAmount)}</span></div><dl className="mt-3 grid grid-cols-3 gap-2 border-t border-[var(--glass-stroke-base)] pt-3 text-xs"><div><dt className="text-[var(--glass-text-tertiary)]">{t('totalTokens')}</dt><dd className="mt-1 text-[var(--glass-text-secondary)]">{formatTokens(row.totalTokens)}</dd></div><div><dt className="text-[var(--glass-text-tertiary)]">{t('videoInputTokens')}</dt><dd className="mt-1 text-[var(--glass-text-secondary)]">{formatTokens(row.videoInputTokens)}</dd></div><div><dt className="text-[var(--glass-text-tertiary)]">{t('noVideoInputTokens')}</dt><dd className="mt-1 text-[var(--glass-text-secondary)]">{formatTokens(row.noVideoInputTokens)}</dd></div></dl></article>)}</div></>}<footer className="flex flex-col gap-3 border-t border-[var(--glass-stroke-base)] px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"><span className="text-center text-[var(--glass-text-tertiary)] sm:text-left">{t('pagination', { total: data.pagination.total, page: data.pagination.page, totalPages })}</span><div className="grid grid-cols-2 gap-2"><button type="button" disabled={page <= 1 || loading} onClick={() => setPage(normalizeUsagePage(page - 1, totalPages))} className="glass-btn-base rounded-xl px-4 py-2 text-[var(--glass-text-secondary)] disabled:opacity-40">{t('previous')}</button><button type="button" disabled={page >= totalPages || loading} onClick={() => setPage(normalizeUsagePage(page + 1, totalPages))} className="glass-btn-base rounded-xl px-4 py-2 text-[var(--glass-text-secondary)] disabled:opacity-40">{t('next')}</button></div></footer></div>
          <p className="text-center text-xs text-[var(--glass-text-tertiary)]">{t('updatedAt', { time: data.fetchedAt.replace('T', ' ').slice(0, 19) })}</p>
          </div>
        ) : null}
      </div>
    </section>
  )
}
