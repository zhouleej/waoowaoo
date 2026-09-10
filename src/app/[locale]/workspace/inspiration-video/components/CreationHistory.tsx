'use client'

import Image from 'next/image'
import { useLocale, useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'
import type { InspirationVideoCreation, InspirationVideoModel } from '../types'

type Props = {
  creations: InspirationVideoCreation[]
  models: InspirationVideoModel[]
  onAction: (creation: InspirationVideoCreation, action: 'retry' | 'cancel' | 'delete' | 'reuse') => void
  busy?: boolean
}

function statusClass(status: string): string {
  if (status === 'failed') return 'bg-[var(--glass-tone-danger-bg)] text-[var(--glass-tone-danger-fg)]'
  if (status === 'completed') return 'bg-[var(--glass-tone-success-bg)] text-[var(--glass-tone-success-fg)]'
  return 'bg-[var(--glass-tone-info-bg)] text-[var(--glass-tone-info-fg)]'
}

export default function CreationHistory({ creations, models, onAction, busy }: Props) {
  const t = useTranslations('inspirationVideo')
  const locale = useLocale()
  const modelLabelByKey = new Map(models.map((model) => [model.value, model.label]))

  return (
    <section className="mt-10">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-[var(--glass-text-primary)]">{t('history.title')}</h2>
          <p className="mt-1 text-sm text-[var(--glass-text-tertiary)]">{t('history.subtitle')}</p>
        </div>
        <span className="text-xs text-[var(--glass-text-tertiary)]">{t('history.count', { count: creations.length })}</span>
      </div>

      {creations.length === 0 ? (
        <div className="glass-surface flex min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--glass-stroke-strong)] px-6 text-center">
          <AppIcon name="film" className="mb-3 h-7 w-7 text-[var(--glass-text-tertiary)]" />
          <p className="text-sm font-medium text-[var(--glass-text-secondary)]">{t('history.emptyTitle')}</p>
          <p className="mt-1 text-xs text-[var(--glass-text-tertiary)]">{t('history.emptyHint')}</p>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {creations.map((creation) => (
            <article key={creation.id} className="glass-surface group overflow-hidden rounded-2xl border border-[var(--glass-stroke-base)] transition-transform hover:-translate-y-0.5">
              <div className="relative aspect-video overflow-hidden bg-[var(--glass-bg-muted)]">
                {creation.videoUrl ? (
                  <video src={creation.videoUrl} controls playsInline preload="metadata" className="h-full w-full bg-black object-contain" />
                ) : creation.primaryImage ? (
                  <Image src={creation.primaryImage.url} alt={creation.prompt} fill unoptimized className="object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center"><AppIcon name="video" className="h-8 w-8 text-[var(--glass-text-tertiary)]" /></div>
                )}
                {!creation.videoUrl && ['queued', 'processing', 'settling'].includes(creation.status) ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/35 backdrop-blur-[1px]">
                    <div className="rounded-full bg-black/55 px-3 py-1.5 text-xs text-white">{creation.progress}%</div>
                  </div>
                ) : null}
                <span className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-[11px] ${statusClass(creation.status)}`}>
                  {t(`status.${creation.status}`)}
                </span>
              </div>
              <div className="p-4">
                <div className="mb-3 flex flex-wrap gap-3 text-xs">
                  <button disabled={busy} onClick={() => onAction(creation, 'reuse')}>{t('actions.reuse')}</button>
                  {['failed', 'canceled'].includes(creation.status) && !creation.videoUrl && <button disabled={busy} onClick={() => onAction(creation, 'retry')}>{t('actions.retry')}</button>}
                  {['queued', 'processing'].includes(creation.status) ? <button disabled={busy} onClick={() => onAction(creation, 'cancel')}>{t('actions.cancel')}</button>
                    : <button disabled={busy || creation.status === 'settling'} onClick={() => onAction(creation, 'delete')}>{t('actions.delete')}</button>}
                  {creation.videoUrl && <a href={creation.videoUrl} download>{t('actions.download')}</a>}
                </div>
                <p className="line-clamp-2 min-h-10 text-sm leading-5 text-[var(--glass-text-primary)]">{creation.prompt}</p>
                {creation.actualMetadata?.durationMs && <p className="mt-2 text-xs text-[var(--glass-text-secondary)]">{t('history.actual')}: {(creation.actualMetadata.durationMs / 1000).toFixed(2)}s · {creation.actualMetadata.width}×{creation.actualMetadata.height} · {creation.actualMetadata.fps}fps</p>}
                {typeof creation.chargedCost === 'number' && <p className="mt-1 text-xs text-[var(--glass-text-secondary)]">{t('history.cost')}: {creation.chargedCost.toFixed(4)}</p>}
                <div className="mt-3 flex items-center justify-between gap-3 text-xs text-[var(--glass-text-tertiary)]">
                  <span className="min-w-0 truncate">{modelLabelByKey.get(creation.modelKey) || creation.modelKey}</span>
                  <span className="shrink-0">{new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(creation.createdAt))}</span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--glass-stroke-base)] pt-3 text-[11px] text-[var(--glass-text-tertiary)]">
                  <span>{creation.aspectRatio}</span><span>·</span><span>{creation.resolution}</span><span>·</span><span>{t('parameters.seconds', { duration: creation.duration })}</span>
                  {creation.referenceImages.length + creation.referenceAudios.length > 0 ? (
                    <span className="ml-auto flex items-center gap-1"><AppIcon name="link" className="h-3 w-3" />{t('history.references', { count: creation.referenceImages.length + creation.referenceAudios.length })}</span>
                  ) : null}
                </div>
                {creation.status === 'failed' ? (
                  <p className="mt-3 line-clamp-2 text-xs leading-5 text-[var(--glass-tone-danger-fg)]">{creation.errorMessage || creation.errorCode || t('preview.failedFallback')}</p>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
