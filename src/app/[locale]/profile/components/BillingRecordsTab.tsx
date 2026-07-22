'use client'

import { useEffect, useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { readApiErrorMessage } from '@/lib/api/read-error-message'
import { AppIcon } from '@/components/ui/icons'
import {
  changeBillingFilter,
  formatBillingDetail,
  formatTokenCount,
  getBillingTokenUsage,
  moveBillingPage,
  type BillingFilter,
} from './billing-records'

const PAGE_SIZE = 20

interface Transaction {
  id: string
  type: string
  amount: number
  balanceAfter: number
  description: string | null
  createdAt: string
  action: string | null
  projectName: string | null
  episodeNumber: number | null
  episodeName: string | null
  billingMeta: Record<string, unknown> | null
}

interface TransactionsResponse {
  currency: string
  transactions: Transaction[]
  pagination: { page: number; pageSize: number; total: number; totalPages: number }
}

function textValue(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text && text !== '[object Object]' ? text : null
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function modelLabel(meta: Transaction['billingMeta']): string | null {
  const root = recordValue(meta)
  if (!root) return null
  const nested = recordValue(root.metadata)
  const models = root.actualModels ?? nested?.actualModels
  if (Array.isArray(models)) {
    const safeModels = models.map(textValue).filter((item): item is string => Boolean(item))
    if (safeModels.length) return safeModels.join(', ')
  }
  return textValue(root.model ?? nested?.model)
}

export default function BillingRecordsTab() {
  const t = useTranslations('profile')
  const locale = useLocale()
  const [filter, setFilter] = useState<BillingFilter>('consume')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<TransactionsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [requestVersion, setRequestVersion] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), type: filter })
        const response = await fetch(`/api/user/transactions?${params}`, { signal: controller.signal })
        if (!response.ok) throw new Error(await readApiErrorMessage(response, t('billingLoadFailed')))
        setData(await response.json() as TransactionsResponse)
      } catch (loadError) {
        if (loadError instanceof DOMException && loadError.name === 'AbortError') return
        setError(loadError instanceof Error ? loadError.message : t('billingLoadFailed'))
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void load()
    return () => controller.abort()
  }, [filter, page, requestVersion, t])

  const money = useMemo(() => new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: data?.currency || 'CNY',
  }), [data?.currency, locale])
  const dateTime = useMemo(() => new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }), [locale])

  const detailLabels = useMemo(() => ({
    image: (count: string) => t('billingDetail.image', { count }),
    imageWithRes: (count: string, resolution: string) => t('billingDetail.imageWithRes', { count, resolution }),
    video: (count: string) => t('billingDetail.video', { count }),
    videoWithRes: (count: string, resolution: string) => t('billingDetail.videoWithRes', { count, resolution }),
    tokens: (count: string) => t('billingDetail.tokens', { count }),
    seconds: (count: string) => t('billingDetail.seconds', { count }),
    calls: (count: string) => t('billingDetail.calls', { count }),
  }), [t])

  const selectFilter = (nextFilter: BillingFilter) => {
    const next = changeBillingFilter(nextFilter)
    setFilter(next.filter)
    setPage(next.page)
  }

  const actionLabel = (transaction: Transaction) => {
    if (transaction.action && t.has(`actionTypes.${transaction.action}`)) return t(`actionTypes.${transaction.action}`)
    return textValue(transaction.action) ?? textValue(transaction.description) ?? t('unknownAction')
  }

  const contextLabel = (transaction: Transaction) => {
    const pieces = [transaction.projectName || t('noProject')]
    if (transaction.episodeNumber !== null) pieces.push(t('episodeLabel', { number: transaction.episodeNumber }))
    return pieces.join(' · ')
  }

  const details = (transaction: Transaction) => formatBillingDetail(transaction.billingMeta, detailLabels, locale)
  const totalPages = Math.max(data?.pagination.totalPages ?? 1, 1)

  return (
    <section className="flex min-h-0 flex-1 flex-col p-4 sm:p-6" aria-labelledby="billing-records-title">
      <div className="flex flex-col gap-4 border-b border-[var(--glass-stroke-base)] pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 id="billing-records-title" className="text-xl font-semibold text-[var(--glass-text-primary)]">{t('billingRecords')}</h1>
          <p className="mt-1 text-sm text-[var(--glass-text-tertiary)]">{t('personalBillingDescription')}</p>
        </div>
        <div className="flex w-full rounded-xl bg-[var(--glass-bg-muted)] p-1 sm:w-auto" aria-label={t('filter')}>
          {(['consume', 'all', 'recharge'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => selectFilter(value)}
              className={`min-w-0 flex-1 rounded-lg px-3 py-2 text-sm transition-colors sm:flex-none ${filter === value ? 'glass-btn-base glass-btn-tone-info text-[var(--glass-text-primary)]' : 'text-[var(--glass-text-secondary)] hover:text-[var(--glass-text-primary)]'}`}
            >
              {value === 'all' ? t('allTypes') : t(value)}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-4">
        {loading ? (
          <div className="flex min-h-52 items-center justify-center text-sm text-[var(--glass-text-secondary)]" role="status">{t('billingLoading')}</div>
        ) : error ? (
          <div className="flex min-h-52 flex-col items-center justify-center gap-4 px-4 text-center" role="alert">
            <AppIcon name="receipt" className="h-9 w-9 text-[var(--glass-text-tertiary)]" />
            <p className="max-w-lg text-sm text-[var(--glass-text-secondary)]">{error}</p>
            <button type="button" onClick={() => setRequestVersion((value) => value + 1)} className="glass-btn-base glass-btn-tone-info rounded-xl px-4 py-2 text-sm">{t('retry')}</button>
          </div>
        ) : !data?.transactions.length ? (
          <div className="flex min-h-52 flex-col items-center justify-center gap-3 text-center">
            <AppIcon name="receipt" className="h-10 w-10 text-[var(--glass-text-tertiary)]" />
            <p className="text-sm text-[var(--glass-text-secondary)]">{t('noTransactions')}</p>
          </div>
        ) : (
          <>
            <div className="hidden md:block">
              <table className="w-full table-fixed text-left text-sm">
                <thead className="text-xs text-[var(--glass-text-tertiary)]">
                  <tr className="border-b border-[var(--glass-stroke-base)]">
                    <th className="w-[17%] px-3 py-3 font-medium">{t('time')}</th>
                    <th className="w-[21%] px-3 py-3 font-medium">{t('projectAndEpisode')}</th>
                    <th className="w-[28%] px-3 py-3 font-medium">{t('billingItem')}</th>
                    <th className="w-[17%] px-3 py-3 text-right font-medium">{t('amount')}</th>
                    <th className="w-[17%] px-3 py-3 text-right font-medium">{t('balance')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.transactions.map((transaction) => {
                    const billingDetails = details(transaction)
                    const tokenUsage = getBillingTokenUsage(transaction.billingMeta)
                    const tokenDetail = tokenUsage ? detailLabels.tokens(formatTokenCount(tokenUsage.total, locale)) : null
                    const nonTokenDetails = tokenDetail ? billingDetails.filter((detail) => detail !== tokenDetail) : billingDetails
                    const model = modelLabel(transaction.billingMeta)
                    return (
                      <tr key={transaction.id} className="border-b border-[var(--glass-stroke-base)]/70 align-top last:border-0">
                        <td className="px-3 py-4 text-[var(--glass-text-secondary)]">{dateTime.format(new Date(transaction.createdAt))}</td>
                        <td className="break-words px-3 py-4 text-[var(--glass-text-primary)]">{contextLabel(transaction)}</td>
                        <td className="px-3 py-4">
                          <div className="font-medium text-[var(--glass-text-primary)]">{actionLabel(transaction)}</div>
                          {model && <div className="mt-1 break-all text-xs text-[var(--glass-text-tertiary)]">{t('model')}: {model}</div>}
                          {tokenUsage && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              <span className="rounded-full bg-[var(--glass-tone-info-bg)] px-2.5 py-1 text-xs font-semibold text-[var(--glass-tone-info-fg)]">
                                {t('tokenUsageTotal', { count: formatTokenCount(tokenUsage.total, locale) })}
                              </span>
                              {tokenUsage.input !== null && <span className="rounded-full bg-[var(--glass-bg-muted)] px-2 py-1 text-[11px] text-[var(--glass-text-secondary)]">{t('tokenUsageInput', { count: formatTokenCount(tokenUsage.input, locale) })}</span>}
                              {tokenUsage.output !== null && <span className="rounded-full bg-[var(--glass-bg-muted)] px-2 py-1 text-[11px] text-[var(--glass-text-secondary)]">{t('tokenUsageOutput', { count: formatTokenCount(tokenUsage.output, locale) })}</span>}
                            </div>
                          )}
                          {nonTokenDetails.length > 0 && <div className="mt-1 text-xs text-[var(--glass-text-secondary)]">{nonTokenDetails.join(' · ')}</div>}
                        </td>
                        <td className={`px-3 py-4 text-right font-semibold ${transaction.amount < 0 ? 'text-[var(--glass-tone-danger-fg)]' : transaction.amount > 0 ? 'text-[var(--glass-tone-success-fg)]' : 'text-[var(--glass-text-secondary)]'}`}>{transaction.amount > 0 ? '+' : ''}{money.format(transaction.amount)}</td>
                        <td className="px-3 py-4 text-right text-[var(--glass-text-secondary)]">{money.format(transaction.balanceAfter)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 md:hidden">
              {data.transactions.map((transaction) => {
                const billingDetails = details(transaction)
                const tokenUsage = getBillingTokenUsage(transaction.billingMeta)
                const tokenDetail = tokenUsage ? detailLabels.tokens(formatTokenCount(tokenUsage.total, locale)) : null
                const nonTokenDetails = tokenDetail ? billingDetails.filter((detail) => detail !== tokenDetail) : billingDetails
                const model = modelLabel(transaction.billingMeta)
                return (
                  <article key={transaction.id} className="glass-surface-soft min-w-0 rounded-2xl border border-[var(--glass-stroke-base)] p-4">
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="break-words font-medium text-[var(--glass-text-primary)]">{actionLabel(transaction)}</h2>
                        <p className="mt-1 break-words text-xs text-[var(--glass-text-tertiary)]">{contextLabel(transaction)}</p>
                      </div>
                      <div className={`shrink-0 font-semibold ${transaction.amount < 0 ? 'text-[var(--glass-tone-danger-fg)]' : transaction.amount > 0 ? 'text-[var(--glass-tone-success-fg)]' : 'text-[var(--glass-text-secondary)]'}`}>{transaction.amount > 0 ? '+' : ''}{money.format(transaction.amount)}</div>
                    </div>
                    {model && <p className="mt-3 break-all text-xs text-[var(--glass-text-secondary)]">{t('model')}: {model}</p>}
                    {tokenUsage && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <span className="rounded-full bg-[var(--glass-tone-info-bg)] px-2.5 py-1 text-xs font-semibold text-[var(--glass-tone-info-fg)]">{t('tokenUsageTotal', { count: formatTokenCount(tokenUsage.total, locale) })}</span>
                        {tokenUsage.input !== null && <span className="rounded-full bg-[var(--glass-bg-muted)] px-2 py-1 text-[11px] text-[var(--glass-text-secondary)]">{t('tokenUsageInput', { count: formatTokenCount(tokenUsage.input, locale) })}</span>}
                        {tokenUsage.output !== null && <span className="rounded-full bg-[var(--glass-bg-muted)] px-2 py-1 text-[11px] text-[var(--glass-text-secondary)]">{t('tokenUsageOutput', { count: formatTokenCount(tokenUsage.output, locale) })}</span>}
                      </div>
                    )}
                    {nonTokenDetails.length > 0 && <p className="mt-1 break-words text-xs text-[var(--glass-text-secondary)]">{nonTokenDetails.join(' · ')}</p>}
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--glass-stroke-base)] pt-3 text-xs text-[var(--glass-text-tertiary)]">
                      <time>{dateTime.format(new Date(transaction.createdAt))}</time>
                      <span>{t('balanceAfter', { amount: money.format(transaction.balanceAfter) })}</span>
                    </div>
                  </article>
                )
              })}
            </div>
          </>
        )}
      </div>

      {!loading && !error && data && data.transactions.length > 0 && (
        <footer className="flex flex-col gap-3 border-t border-[var(--glass-stroke-base)] pt-4 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="text-center text-[var(--glass-text-tertiary)] sm:text-left">{t('pagination', { total: data.pagination.total, page: data.pagination.page, totalPages })}</span>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" disabled={page <= 1} onClick={() => setPage(moveBillingPage(page, 'previous', totalPages))} className="glass-btn-base rounded-xl px-4 py-2 text-[var(--glass-text-secondary)] disabled:cursor-not-allowed disabled:opacity-40">{t('previousPage')}</button>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage(moveBillingPage(page, 'next', totalPages))} className="glass-btn-base rounded-xl px-4 py-2 text-[var(--glass-text-secondary)] disabled:cursor-not-allowed disabled:opacity-40">{t('nextPage')}</button>
          </div>
        </footer>
      )}
    </section>
  )
}
