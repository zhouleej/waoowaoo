'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'
import { requestTaskResponseWithError } from '@/lib/query/mutations/mutation-shared'
import { resolveTaskResponse } from '@/lib/task/client'

interface VirtualHumanTrialModalProps {
  onClose: () => void
}

export default function VirtualHumanTrialModal({ onClose }: VirtualHumanTrialModalProps) {
  const t = useTranslations('assetHub.virtualHumanTrial')
  const [assetUri, setAssetUri] = useState('')
  const [prompt, setPrompt] = useState(t('defaultPrompt'))
  const [resultUrl, setResultUrl] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const runTrial = async () => {
    if (!assetUri.trim() || !prompt.trim()) return
    setIsSubmitting(true)
    try {
      const response = await requestTaskResponseWithError(
        '/api/asset-hub/virtual-human-trial',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assetUri: assetUri.trim(), prompt: prompt.trim() }),
        },
        t('trialFailed'),
      )
      const data = await resolveTaskResponse<{ videoUrl?: string }>(response)
      if (!data.videoUrl) throw new Error(t('trialFailed'))
      setResultUrl(data.videoUrl)
    } catch (error) {
      alert(error instanceof Error ? error.message : t('trialFailed'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 glass-overlay" onClick={(event) => {
      if (event.target === event.currentTarget && !isSubmitting) onClose()
    }}>
      <div className="glass-surface-modal flex max-h-[88vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl">
        <div className="flex items-start justify-between border-b border-[var(--glass-stroke-base)] px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-[var(--glass-text-primary)]">{t('title')}</h2>
            <p className="mt-1 text-sm leading-5 text-[var(--glass-text-tertiary)]">{t('description')}</p>
          </div>
          <button type="button" onClick={onClose} disabled={isSubmitting} className="glass-btn-base glass-btn-soft rounded-full p-2" aria-label={t('close')}>
            <AppIcon name="close" className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          <div className="rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)]/45 p-3 text-xs leading-5 text-[var(--glass-text-secondary)]">
            <div className="flex items-start gap-2">
              <AppIcon name="info" className="mt-0.5 h-4 w-4 shrink-0 text-[var(--glass-tone-info-fg)]" />
              <span>{t('tip')} <a href="https://ecloud.10086.cn/op-help-center/doc/outline/108290" target="_blank" rel="noreferrer" className="text-[var(--glass-tone-info-fg)] hover:underline">{t('docs')}</a></span>
            </div>
          </div>

          {!resultUrl ? (
            <>
              <label className="block space-y-2">
                <span className="glass-field-label">{t('assetUri')}</span>
                <input value={assetUri} onChange={(event) => setAssetUri(event.target.value)} placeholder="asset://asset-..." className="glass-input-base w-full px-3 py-2 text-sm" autoFocus />
                <span className="block text-xs text-[var(--glass-text-tertiary)]">{t('assetUriHint')}</span>
              </label>
              <label className="block space-y-2">
                <span className="glass-field-label">{t('prompt')}</span>
                <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} maxLength={500} rows={4} className="glass-textarea-base w-full resize-none px-3 py-2 text-sm" />
                <span className="block text-right text-xs text-[var(--glass-text-tertiary)]">{prompt.length}/500</span>
              </label>
              <p className="rounded-xl bg-[var(--glass-tone-info-bg)] px-3 py-2 text-xs text-[var(--glass-tone-info-fg)]">{t('spec')}</p>
            </>
          ) : (
            <div className="space-y-3">
              <video src={resultUrl} controls playsInline className="max-h-[52vh] w-full rounded-xl border border-[var(--glass-stroke-base)] bg-black" />
              <p className="text-sm text-[var(--glass-text-secondary)]">{t('resultHint')}</p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface-strong)] px-5 py-4">
          <button type="button" onClick={onClose} disabled={isSubmitting} className="glass-btn-base glass-btn-secondary rounded-xl px-4 py-2 text-sm">{t('cancel')}</button>
          {resultUrl ? (
            <button type="button" onClick={() => setResultUrl(null)} className="glass-btn-base glass-btn-tone-info rounded-xl px-4 py-2 text-sm">{t('tryAgain')}</button>
          ) : (
            <button type="button" onClick={() => { void runTrial() }} disabled={isSubmitting || !assetUri.trim() || !prompt.trim()} className="glass-btn-base glass-btn-primary rounded-xl px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40">
              {isSubmitting ? t('testing') : t('start')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
