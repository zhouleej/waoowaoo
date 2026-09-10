'use client'

import Image from 'next/image'
import { useEffect, useState, type ChangeEvent, type DragEvent } from 'react'
import { useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'
import type { InspirationVideoForm, InspirationVideoModel } from '../types'

type Props = {
  form: InspirationVideoForm
  models: InspirationVideoModel[]
  durationOptions: number[]
  resolutionOptions: string[]
  audioOptions: boolean[]
  referencesEnabled: boolean
  submitting: boolean
  onChange: (patch: Partial<InspirationVideoForm>) => void
  onModelChange: (modelKey: string) => void
  onSubmit: () => void
}

function FileThumbnail({ file, onRemove }: { file: File; onRemove: () => void }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file)
    setSrc(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [file])

  return (
    <div className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)]">
      {src ? <Image src={src} alt={file.name} fill unoptimized className="object-cover" /> : null}
      <button
        type="button"
        onClick={onRemove}
        className="absolute right-1 top-1 rounded-full bg-black/55 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
        aria-label={file.name}
      >
        <AppIcon name="close" className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

function AudioChip({ file, onRemove }: { file: File; onRemove: () => void }) {
  return (
    <div className="flex max-w-52 items-center gap-2 rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] px-3 py-2">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--glass-tone-info-bg)] text-[var(--glass-tone-info-fg)]">
        <AppIcon name="audioWave" className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1 truncate text-xs text-[var(--glass-text-secondary)]">{file.name}</span>
      <button type="button" onClick={onRemove} className="text-[var(--glass-text-tertiary)] hover:text-[var(--glass-text-primary)]">
        <AppIcon name="close" className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

export default function InspirationComposer({
  form,
  models,
  durationOptions,
  resolutionOptions,
  audioOptions,
  referencesEnabled,
  submitting,
  onChange,
  onModelChange,
  onSubmit,
}: Props) {
  const t = useTranslations('inspirationVideo')

  const addReferenceImages = (files: File[]) => {
    const next = [...form.referenceImages, ...files].slice(0, 8)
    onChange({ referenceImages: next })
  }
  const addReferenceAudios = (files: File[]) => {
    const next = [...form.referenceAudios, ...files].slice(0, 3)
    onChange({ referenceAudios: next, generateAudio: true })
  }
  const handlePrimaryChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange({ primaryImage: event.target.files?.[0] || null })
    event.currentTarget.value = ''
  }
  const handlePrimaryDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault()
    const file = Array.from(event.dataTransfer.files).find((item) => item.type.startsWith('image/'))
    if (file) onChange({ primaryImage: file })
  }

  const canSubmit = Boolean(form.prompt.trim() && form.primaryImage && form.modelKey && !submitting)

  return (
    <section className="glass-surface-elevated overflow-hidden rounded-3xl border border-[var(--glass-stroke-base)]">
      <div className="border-b border-[var(--glass-stroke-base)] px-5 py-4 sm:px-7">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--glass-tone-info-bg)] text-[var(--glass-tone-info-fg)]">
              <AppIcon name="sparkles" className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-semibold text-[var(--glass-text-primary)]">{t('composer.title')}</h2>
              <p className="text-xs text-[var(--glass-text-tertiary)]">{t('composer.subtitle')}</p>
            </div>
          </div>
          <span className="rounded-full border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] px-3 py-1 text-xs text-[var(--glass-text-secondary)]">
            {t('composer.mode')}
          </span>
        </div>
      </div>

      <div className="space-y-6 p-5 sm:p-7">
        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <label htmlFor="inspiration-prompt" className="text-sm font-medium text-[var(--glass-text-primary)]">{t('prompt.label')}</label>
            <span className="text-xs text-[var(--glass-text-tertiary)]">{form.prompt.length}/2000</span>
          </div>
          <textarea
            id="inspiration-prompt"
            value={form.prompt}
            maxLength={2000}
            onChange={(event) => onChange({ prompt: event.target.value })}
            placeholder={t('prompt.placeholder')}
            className="glass-input-base min-h-36 w-full resize-y rounded-2xl px-4 py-3 text-sm leading-6 outline-none"
          />
        </div>

        <div>
          <div className="mb-3 flex items-end justify-between gap-4">
            <div>
              <h3 className="text-sm font-medium text-[var(--glass-text-primary)]">{t('materials.title')}</h3>
              <p className="mt-1 text-xs text-[var(--glass-text-tertiary)]">{t('materials.hint')}</p>
            </div>
            <span className="text-xs text-[var(--glass-text-tertiary)]">
              {1 + form.referenceImages.length + form.referenceAudios.length}/12
            </span>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1fr_1.4fr]">
            <div className="rounded-2xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-[var(--glass-text-secondary)]">{t('materials.primary')}</span>
                <span className="text-[11px] text-[var(--glass-tone-danger-fg)]">{t('materials.required')}</span>
              </div>
              {form.primaryImage ? (
                <div className="flex items-center gap-3">
                  <FileThumbnail file={form.primaryImage} onRemove={() => onChange({ primaryImage: null })} />
                  <div className="min-w-0">
                    <p className="truncate text-sm text-[var(--glass-text-primary)]">{form.primaryImage.name}</p>
                    <label className="mt-2 inline-flex cursor-pointer items-center gap-1 text-xs text-[var(--glass-tone-info-fg)]">
                      <AppIcon name="refresh" className="h-3.5 w-3.5" />{t('materials.replace')}
                      <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePrimaryChange} className="hidden" />
                    </label>
                  </div>
                </div>
              ) : (
                <label
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={handlePrimaryDrop}
                  className="flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-[var(--glass-stroke-strong)] bg-[var(--glass-bg-muted)] px-3 text-center transition-colors hover:border-[var(--glass-tone-info-fg)]/50"
                >
                  <AppIcon name="imageEdit" className="mb-2 h-5 w-5 text-[var(--glass-text-tertiary)]" />
                  <span className="text-xs text-[var(--glass-text-secondary)]">{t('materials.uploadPrimary')}</span>
                  <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePrimaryChange} className="hidden" />
                </label>
              )}
            </div>

            <div className="space-y-3 rounded-2xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-medium text-[var(--glass-text-secondary)]">{t('materials.references')}</span>
                <span className="text-[11px] text-[var(--glass-text-tertiary)]">{t('materials.referenceLimit')}</span>
              </div>
              <div className="flex min-h-20 flex-wrap items-center gap-2">
                {form.referenceImages.map((file, index) => (
                  <FileThumbnail
                    key={`${file.name}-${file.lastModified}-${index}`}
                    file={file}
                    onRemove={() => onChange({ referenceImages: form.referenceImages.filter((_, itemIndex) => itemIndex !== index) })}
                  />
                ))}
                {form.referenceAudios.map((file, index) => (
                  <AudioChip
                    key={`${file.name}-${file.lastModified}-${index}`}
                    file={file}
                    onRemove={() => onChange({ referenceAudios: form.referenceAudios.filter((_, itemIndex) => itemIndex !== index) })}
                  />
                ))}
                <label className={`flex h-20 w-20 flex-col items-center justify-center rounded-xl border border-dashed border-[var(--glass-stroke-strong)] text-center ${referencesEnabled ? 'cursor-pointer hover:border-[var(--glass-tone-info-fg)]/50' : 'cursor-not-allowed opacity-45'}`}>
                  <AppIcon name="image" className="mb-1 h-4 w-4 text-[var(--glass-text-tertiary)]" />
                  <span className="text-[11px] text-[var(--glass-text-secondary)]">{t('materials.addImage')}</span>
                  <input
                    type="file"
                    multiple
                    disabled={!referencesEnabled}
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(event) => {
                      addReferenceImages(Array.from(event.target.files || []))
                      event.currentTarget.value = ''
                    }}
                  />
                </label>
                <label className={`flex h-20 w-20 flex-col items-center justify-center rounded-xl border border-dashed border-[var(--glass-stroke-strong)] text-center ${referencesEnabled ? 'cursor-pointer hover:border-[var(--glass-tone-info-fg)]/50' : 'cursor-not-allowed opacity-45'}`}>
                  <AppIcon name="audioWave" className="mb-1 h-4 w-4 text-[var(--glass-text-tertiary)]" />
                  <span className="text-[11px] text-[var(--glass-text-secondary)]">{t('materials.addAudio')}</span>
                  <input
                    type="file"
                    multiple
                    disabled={!referencesEnabled}
                    accept="audio/aac,audio/mp4,audio/mpeg,audio/ogg,audio/wav,audio/webm,.m4a"
                    className="hidden"
                    onChange={(event) => {
                      addReferenceAudios(Array.from(event.target.files || []))
                      event.currentTarget.value = ''
                    }}
                  />
                </label>
              </div>
              {!referencesEnabled ? (
                <p className="flex items-center gap-1.5 text-[11px] text-[var(--glass-tone-warning-fg)]">
                  <AppIcon name="info" className="h-3.5 w-3.5" />{t('materials.mobileCloudOnly')}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <label className="space-y-1.5 xl:col-span-2">
            <span className="text-xs font-medium text-[var(--glass-text-secondary)]">{t('parameters.model')}</span>
            <select value={form.modelKey} onChange={(event) => onModelChange(event.target.value)} className="glass-input-base h-11 w-full rounded-xl px-3 text-sm">
              <option value="">{t('parameters.selectModel')}</option>
              {models.map((model) => <option key={model.value} value={model.value}>{model.label}{model.providerName ? ` · ${model.providerName}` : ''}</option>)}
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-[var(--glass-text-secondary)]">{t('parameters.ratio')}</span>
            <select value={form.aspectRatio} onChange={(event) => onChange({ aspectRatio: event.target.value })} className="glass-input-base h-11 w-full rounded-xl px-3 text-sm">
              {['16:9', '9:16', '1:1', '4:3', '3:4'].map((ratio) => <option key={ratio} value={ratio}>{ratio}</option>)}
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-[var(--glass-text-secondary)]">{t('parameters.resolution')}</span>
            <select value={form.resolution} onChange={(event) => onChange({ resolution: event.target.value })} className="glass-input-base h-11 w-full rounded-xl px-3 text-sm">
              {resolutionOptions.map((resolution) => <option key={resolution} value={resolution}>{resolution}</option>)}
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-[var(--glass-text-secondary)]">{t('parameters.duration')}</span>
            <select value={form.duration} onChange={(event) => onChange({ duration: Number(event.target.value) })} className="glass-input-base h-11 w-full rounded-xl px-3 text-sm">
              {durationOptions.map((duration) => <option key={duration} value={duration}>{t('parameters.seconds', { duration })}</option>)}
            </select>
          </label>
        </div>

        <div className="flex flex-col gap-3 border-t border-[var(--glass-stroke-base)] pt-5 sm:flex-row sm:items-center sm:justify-between">
          <label className={`flex items-center gap-3 ${audioOptions.length <= 1 ? 'opacity-60' : ''}`}>
            <button
              type="button"
              role="switch"
              aria-checked={form.generateAudio}
              disabled={audioOptions.length <= 1 || form.referenceAudios.length > 0}
              onClick={() => onChange({ generateAudio: !form.generateAudio })}
              className={`relative h-6 w-11 rounded-full transition-colors ${form.generateAudio ? 'bg-[var(--glass-tone-info-fg)]' : 'bg-[var(--glass-bg-muted)]'} disabled:cursor-not-allowed`}
            >
              <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${form.generateAudio ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
            <span>
              <span className="block text-sm font-medium text-[var(--glass-text-primary)]">{t('parameters.nativeAudio')}</span>
              <span className="block text-xs text-[var(--glass-text-tertiary)]">{t('parameters.nativeAudioHint')}</span>
            </span>
          </label>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={onSubmit}
            className="glass-btn-base glass-btn-primary inline-flex min-w-40 items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-45"
          >
            <AppIcon name={submitting ? 'loader' : 'sparkles'} className={`h-4 w-4 ${submitting ? 'animate-spin' : ''}`} />
            {submitting ? t('actions.submitting') : t('actions.generate')}
          </button>
        </div>
      </div>
    </section>
  )
}
