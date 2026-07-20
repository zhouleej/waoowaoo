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
  formatTokens: (value: number | null) => string
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
      {trend.length > 0 && (
        <div className="flex justify-between px-2 text-xs text-[var(--glass-text-tertiary)]">
          <span>{trend[0].date}</span>
          <span>{trend[trend.length - 1].date}</span>
        </div>
      )}
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
  const [inferenceInput, setInferenceInput] = useState('')
  const [inferenceName, setInferenceName] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [data, setData] = useState<MobileCloudUsageData | null>(null)
  const [adminConfigured, setAdminConfigured] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [diagnostics, setDiagnostics] = useState<string[]>([])
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      setLoading(true)
      setError(null)
      setDiagnostics([])
      const params = new URLSearchParams({
        beginDate: appliedRange.beginDate,
        endDate: appliedRange.endDate,
        inferenceName,
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
  }, [appliedRange, inferenceName, page, pageSize, reloadKey, t])

  const formatTokens = (value: number | null) => value === null
    ? '—'
    : new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value)
  const formatPercent = (value: number | null) => value === null ? '—' : `${value.toFixed(2)}%`
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
    setInferenceName(inferenceInput.trim())
    setPage(1)
  }

  const summaryCards = data ? [
    { label: t('totalTokens'), value: formatTokens(data.package.totalTokens), tone: 'text-[var(--glass-text-primary)]' },
    { label: t('usedTokens'), value: formatTokens(data.package.usedTokens), tone: 'text-[var(--glass-tone-warning-fg)]' },
    { label: t('remainingTokens'), value: formatTokens(data.package.remainingTokens), tone: 'text-[var(--glass-tone-success-fg)]' },
    { label: t('usedPercent'), value: formatPercent(data.package.usedPercent), tone: 'text-[var(--glass-tone-info-fg)]' },
  ] : []

  return (
    <section className="flex min-h-0 flex-1 flex-col p-4 sm:p-6" aria-labelledby="mobile-cloud-title">
      <div className="flex flex-col gap-3 border-b border-[var(--glass-stroke-base)] pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 id="mobile-cloud-title" className="text-xl font-semibold text-[var(--glass-text-primary)]">{t('title')}</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--glass-text-tertiary)]">{t('description')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {adminConfigured !== null && (
            <span className="rounded-full border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)] px-3 py-1.5 text-[var(--glass-text-secondary)]">
              {adminConfigured ? t('configured') : t('notConfigured')}
            </span>
          )}
          {data?.stale && <span className="rounded-full bg-[var(--glass-tone-warning-bg)] px-3 py-1.5 text-[var(--glass-tone-warning-fg)]">{t('stale')}</span>}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-5">
        {loading && !data ? (
          <div className="flex min-h-72 items-center justify-center gap-3 text-sm text-[var(--glass-text-secondary)]" role="status">
            <AppIcon name="loader" className="h-5 w-5 animate-spin" />{t('loading')}
          </div>
        ) : error ? (
          <div className="flex min-h-72 flex-col items-center justify-center gap-4 px-4 text-center" role="alert">
            <AppIcon name="cloudUpload" className="h-10 w-10 text-[var(--glass-text-tertiary)]" />
            <div>
              <p className="text-sm font-medium text-[var(--glass-text-primary)]">{error}</p>
              {diagnostics.length > 0 && <p className="mt-2 max-w-xl break-words text-xs text-[var(--glass-text-tertiary)]">{t('missingConfig')}: {diagnostics.join(', ')}</p>}
            </div>
            <button type="button" onClick={() => setReloadKey((value) => value + 1)} className="glass-btn-base glass-btn-tone-info rounded-xl px-4 py-2 text-sm">{t('retry')}</button>
          </div>
        ) : data ? (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {summaryCards.map((card) => (
                <div key={card.label} className="glass-surface-soft rounded-2xl border border-[var(--glass-stroke-base)] p-4">
                  <div className="text-xs font-medium text-[var(--glass-text-tertiary)]">{card.label}</div>
                  <div className={`mt-2 truncate text-xl font-semibold tabular-nums ${card.tone}`} title={card.value}>{card.value}</div>
                </div>
              ))}
            </div>

            <div className="glass-surface-soft rounded-2xl border border-[var(--glass-stroke-base)] p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <div className="truncate font-medium text-[var(--glass-text-primary)]">{data.package.packageName}</div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--glass-text-tertiary)]">
                    <span>{t('pool')}: {data.package.poolName}</span>
                    <span>{t('status')}: {data.package.status === 'ONCE_USING' ? t('active') : data.package.status}</span>
                    <span>{t('validPeriod')}: {data.package.effectTime} — {data.package.expireTime}</span>
                  </div>
                </div>
                <div className="w-full lg:max-w-xs">
                  <div className="mb-1 flex justify-between text-xs text-[var(--glass-text-tertiary)]"><span>{t('usageProgress')}</span><span>{formatPercent(data.package.usedPercent)}</span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-[var(--glass-bg-muted)]">
                    <div className="h-full rounded-full bg-[var(--glass-tone-info-fg)] transition-[width]" style={{ width: `${Math.min(100, Math.max(0, data.package.usedPercent ?? 0))}%` }} />
                  </div>
                </div>
              </div>
            </div>

            <form onSubmit={applyFilters} className="glass-surface-soft rounded-2xl border border-[var(--glass-stroke-base)] p-4">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
                <div className="flex flex-wrap gap-2">
                  {[7, 30, 90].map((days) => (
                    <button key={days} type="button" onClick={() => applyPreset(days)} className="glass-btn-base rounded-xl px-3 py-2 text-sm text-[var(--glass-text-secondary)] hover:text-[var(--glass-text-primary)]">{t('days', { days })}</button>
                  ))}
                </div>
                <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-[var(--glass-text-tertiary)]">{t('beginDate')}
                  <input type="date" value={beginDate} max={endDate} onChange={(event) => setBeginDate(event.target.value)} className="glass-input h-10 rounded-xl px-3 text-sm text-[var(--glass-text-primary)]" required />
                </label>
                <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-[var(--glass-text-tertiary)]">{t('endDate')}
                  <input type="date" value={endDate} min={beginDate} onChange={(event) => setEndDate(event.target.value)} className="glass-input h-10 rounded-xl px-3 text-sm text-[var(--glass-text-primary)]" required />
                </label>
                <label className="flex min-w-0 flex-[1.5] flex-col gap-1 text-xs text-[var(--glass-text-tertiary)]">{t('modelFilter')}
                  <input value={inferenceInput} onChange={(event) => setInferenceInput(event.target.value)} maxLength={100} placeholder={t('modelPlaceholder')} className="glass-input h-10 rounded-xl px-3 text-sm text-[var(--glass-text-primary)]" />
                </label>
                <button type="submit" className="glass-btn-base glass-btn-tone-info h-10 rounded-xl px-5 text-sm font-medium">{t('query')}</button>
              </div>
            </form>

            <div className="glass-surface-soft rounded-2xl border border-[var(--glass-stroke-base)] p-4 sm:p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div><h2 className="font-semibold text-[var(--glass-text-primary)]">{t('trendTitle')}</h2><p className="mt-1 text-xs text-[var(--glass-text-tertiary)]">{t('trendDescription')}</p></div>
                <AppIcon name="chart" className="h-5 w-5 text-[var(--glass-tone-info-fg)]" />
              </div>
              {data.trend.length ? <UsageTrendChart trend={data.trend} formatTokens={formatTokens} /> : <div className="flex min-h-56 items-center justify-center text-sm text-[var(--glass-text-tertiary)]">{t('noUsage')}</div>}
            </div>

            <div className="glass-surface-soft overflow-hidden rounded-2xl border border-[var(--glass-stroke-base)]">
              <div className="flex items-center justify-between border-b border-[var(--glass-stroke-base)] px-4 py-3">
                <h2 className="font-semibold text-[var(--glass-text-primary)]">{t('detailsTitle')}</h2>
                <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1) }} className="glass-input rounded-lg px-2 py-1.5 text-xs text-[var(--glass-text-secondary)]">
                  {[10, 20, 50].map((size) => <option key={size} value={size}>{t('perPage', { count: size })}</option>)}
                </select>
              </div>
              {!data.rows.length ? <div className="flex min-h-40 items-center justify-center text-sm text-[var(--glass-text-tertiary)]">{t('noUsage')}</div> : (
                <>
                  <div className="hidden overflow-x-auto md:block">
                    <table className="w-full min-w-[760px] table-fixed text-left text-sm">
                      <thead className="text-xs text-[var(--glass-text-tertiary)]"><tr className="border-b border-[var(--glass-stroke-base)]"><th className="w-[21%] px-4 py-3 font-medium">{t('time')}</th><th className="w-[28%] px-4 py-3 font-medium">{t('model')}</th><th className="w-[14%] px-4 py-3 text-right font-medium">{t('inputTokens')}</th><th className="w-[14%] px-4 py-3 text-right font-medium">{t('outputTokens')}</th><th className="w-[14%] px-4 py-3 text-right font-medium">{t('totalTokens')}</th><th className="w-[15%] px-4 py-3 text-right font-medium">{t('usageAmount')}</th></tr></thead>
                      <tbody>{data.rows.map((row) => <tr key={`${row.inferenceId}-${row.useTime}-${row.totalUsageAmount}`} className="border-b border-[var(--glass-stroke-base)]/70 last:border-0"><td className="px-4 py-3 text-[var(--glass-text-secondary)]">{row.useTime}</td><td className="break-words px-4 py-3 text-[var(--glass-text-primary)]">{row.inferenceName}</td><td className="px-4 py-3 text-right tabular-nums text-[var(--glass-text-secondary)]">{formatTokens(row.promptTokens)}</td><td className="px-4 py-3 text-right tabular-nums text-[var(--glass-text-secondary)]">{formatTokens(row.completionTokens)}</td><td className="px-4 py-3 text-right font-medium tabular-nums text-[var(--glass-text-primary)]">{formatTokens(row.totalTokens)}</td><td className="px-4 py-3 text-right tabular-nums text-[var(--glass-tone-info-fg)]">{formatTokens(row.totalUsageAmount)}</td></tr>)}</tbody>
                    </table>
                  </div>
                  <div className="space-y-3 p-3 md:hidden">{data.rows.map((row) => <article key={`${row.inferenceId}-${row.useTime}-${row.totalUsageAmount}`} className="rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)]/45 p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-words text-sm font-medium text-[var(--glass-text-primary)]">{row.inferenceName}</h3><p className="mt-1 text-xs text-[var(--glass-text-tertiary)]">{row.useTime}</p></div><span className="shrink-0 text-sm font-semibold tabular-nums text-[var(--glass-tone-info-fg)]">{formatTokens(row.totalTokens)}</span></div><dl className="mt-3 grid grid-cols-3 gap-2 border-t border-[var(--glass-stroke-base)] pt-3 text-xs"><div><dt className="text-[var(--glass-text-tertiary)]">{t('inputTokens')}</dt><dd className="mt-1 text-[var(--glass-text-secondary)]">{formatTokens(row.promptTokens)}</dd></div><div><dt className="text-[var(--glass-text-tertiary)]">{t('outputTokens')}</dt><dd className="mt-1 text-[var(--glass-text-secondary)]">{formatTokens(row.completionTokens)}</dd></div><div><dt className="text-[var(--glass-text-tertiary)]">{t('usageAmount')}</dt><dd className="mt-1 text-[var(--glass-text-secondary)]">{formatTokens(row.totalUsageAmount)}</dd></div></dl></article>)}</div>
                </>
              )}
              <footer className="flex flex-col gap-3 border-t border-[var(--glass-stroke-base)] px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"><span className="text-center text-[var(--glass-text-tertiary)] sm:text-left">{t('pagination', { total: data.pagination.total, page: data.pagination.page, totalPages })}</span><div className="grid grid-cols-2 gap-2"><button type="button" disabled={page <= 1 || loading} onClick={() => setPage(normalizeUsagePage(page - 1, totalPages))} className="glass-btn-base rounded-xl px-4 py-2 text-[var(--glass-text-secondary)] disabled:opacity-40">{t('previous')}</button><button type="button" disabled={page >= totalPages || loading} onClick={() => setPage(normalizeUsagePage(page + 1, totalPages))} className="glass-btn-base rounded-xl px-4 py-2 text-[var(--glass-text-secondary)] disabled:opacity-40">{t('next')}</button></div></footer>
            </div>
            <p className="text-center text-xs text-[var(--glass-text-tertiary)]">{t('updatedAt', { time: data.fetchedAt.replace('T', ' ').slice(0, 19) })}</p>
          </div>
        ) : null}
      </div>
    </section>
  )
}
