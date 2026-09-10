'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'
import type { InspirationVideoCreation } from '../types'

type Props = {
  creation: InspirationVideoCreation | null
  pendingImage: File | null
}

function StatusBadge({ status }: { status: string }) {
  const t = useTranslations('inspirationVideo')
  const isFailed = status === 'failed'
  const isDone = status === 'completed'
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${isFailed ? 'bg-[var(--glass-tone-danger-bg)] text-[var(--glass-tone-danger-fg)]' : isDone ? 'bg-[var(--glass-tone-success-bg)] text-[var(--glass-tone-success-fg)]' : 'bg-[var(--glass-tone-info-bg)] text-[var(--glass-tone-info-fg)]'}`}>
      {!isDone && !isFailed ? <AppIcon name="loader" className="h-3.5 w-3.5 animate-spin" /> : null}
      {t(`status.${status}`)}
    </span>
  )
}

export default function CreationPreview({ creation, pendingImage }: Props) {
  const t = useTranslations('inspirationVideo')
  const [pendingImageUrl, setPendingImageUrl] = useState('')
  useEffect(() => {
    if (!pendingImage) {
      setPendingImageUrl('')
      return
    }
    const objectUrl = URL.createObjectURL(pendingImage)
    setPendingImageUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [pendingImage])

  const backgroundImage = creation?.primaryImage?.url || pendingImageUrl
  const running = creation && ['queued', 'processing', 'settling'].includes(creation.status)

  return (
    <aside className="glass-surface sticky top-24 overflow-hidden rounded-3xl border border-[var(--glass-stroke-base)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--glass-stroke-base)] px-5 py-4">
        <div>
          <h2 className="font-semibold text-[var(--glass-text-primary)]">{t('preview.title')}</h2>
          <p className="text-xs text-[var(--glass-text-tertiary)]">{t('preview.subtitle')}</p>
        </div>
        {creation ? <StatusBadge status={creation.status} /> : null}
      </div>

      <div className="p-4">
        <div className="relative flex min-h-[500px] items-center justify-center overflow-hidden rounded-2xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)]">
          {creation?.videoUrl ? (
            <video src={creation.videoUrl} controls playsInline preload="metadata" className="max-h-[560px] w-full bg-black object-contain" />
          ) : backgroundImage ? (
            <>
              <Image src={backgroundImage} alt={t('preview.imageAlt')} fill unoptimized className={`object-cover ${running ? 'scale-105 blur-[2px]' : ''}`} />
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/5 to-black/10" />
              {running ? (
                <div className="relative z-10 mx-6 w-full rounded-2xl border border-white/20 bg-black/45 p-5 text-white backdrop-blur-xl">
                  <div className="mb-3 flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2"><AppIcon name="sparkles" className="h-4 w-4" />{t('preview.generating')}</span>
                    <span>{creation.progress}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/20">
                    <div className="h-full rounded-full bg-white transition-all" style={{ width: `${Math.max(4, creation.progress)}%` }} />
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <div className="max-w-64 px-5 text-center">
              <span className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-[var(--glass-bg-surface)] text-[var(--glass-text-tertiary)] shadow-sm">
                <AppIcon name="clapperboard" className="h-8 w-8" />
              </span>
              <p className="font-medium text-[var(--glass-text-secondary)]">{t('preview.emptyTitle')}</p>
              <p className="mt-2 text-xs leading-5 text-[var(--glass-text-tertiary)]">{t('preview.emptyHint')}</p>
            </div>
          )}
        </div>

        {creation ? (
          <div className="mt-4 space-y-3">
            <p className="line-clamp-3 text-sm leading-6 text-[var(--glass-text-secondary)]">{creation.prompt}</p>
            <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--glass-text-tertiary)]">
              <span>{creation.aspectRatio}</span><span>·</span><span>{creation.resolution}</span><span>·</span><span>{t('parameters.seconds', { duration: creation.duration })}</span>
            </div>
            {creation.status === 'failed' ? (
              <div className="rounded-xl bg-[var(--glass-tone-danger-bg)] px-3 py-2 text-xs leading-5 text-[var(--glass-tone-danger-fg)]">
                {creation.errorMessage || creation.errorCode || t('preview.failedFallback')}
              </div>
            ) : null}
            {creation.videoUrl ? (
              <a href={creation.videoUrl} target="_blank" rel="noreferrer" download className="glass-btn-base glass-btn-secondary flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm">
                <AppIcon name="download" className="h-4 w-4" />{t('actions.download')}
              </a>
            ) : null}
          </div>
        ) : null}
      </div>
    </aside>
  )
}
