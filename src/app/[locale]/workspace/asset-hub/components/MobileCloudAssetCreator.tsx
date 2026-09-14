'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import LocalImageUpload from '@/components/shared/assets/LocalImageUpload'
import { AppIcon } from '@/components/ui/icons'

export type MobileCloudAssetType = 'Image' | 'Video' | 'Audio'

export type MobileCloudAssetCreateInput = {
  assetName: string
  assetUrl: string
  assetType: MobileCloudAssetType
  assetStorageKey?: string
}

export type MobileCloudAssetCreateResult = {
  success: boolean
  error?: string
}

type Props = {
  disabled: boolean
  assetName: string
  assetUrl: string
  assetType: MobileCloudAssetType
  onAssetNameChange: (value: string) => void
  onAssetUrlChange: (value: string) => void
  onAssetTypeChange: (value: MobileCloudAssetType) => void
  onCreate: (input: MobileCloudAssetCreateInput) => Promise<MobileCloudAssetCreateResult>
}

export function defaultMobileCloudAssetName(fileName: string): string {
  const trimmed = fileName.trim()
  const lastDot = trimmed.lastIndexOf('.')
  const withoutExtension = lastDot > 0 ? trimmed.slice(0, lastDot) : trimmed
  return (withoutExtension.trim() || '本地图片').slice(0, 64)
}

export default function MobileCloudAssetCreator({
  disabled,
  assetName,
  assetUrl,
  assetType,
  onAssetNameChange,
  onAssetUrlChange,
  onAssetTypeChange,
  onCreate,
}: Props) {
  const t = useTranslations('assetHub.mobileCloud')
  const [sourceMode, setSourceMode] = useState<'url' | 'local'>('url')
  const [localAssetUrl, setLocalAssetUrl] = useState<string | null>(null)
  const [localAssetStorageKey, setLocalAssetStorageKey] = useState<string | null>(null)
  const [uploadResetKey, setUploadResetKey] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const selectedUrl = sourceMode === 'local' ? localAssetUrl || '' : assetUrl

  useEffect(() => {
    if (assetUrl) setSourceMode('url')
  }, [assetUrl])

  const create = async () => {
    if (!assetName.trim() || !selectedUrl.trim()) return
    setSubmitting(true)
    setSubmitError('')
    try {
      const result = await onCreate({
        assetName: assetName.trim(),
        assetUrl: selectedUrl.trim(),
        assetType: sourceMode === 'local' ? 'Image' : assetType,
        ...(sourceMode === 'local' && localAssetStorageKey
          ? { assetStorageKey: localAssetStorageKey }
          : {}),
      })
      if (!result.success) {
        setSubmitError(result.error || t('requestFailed'))
        return
      }
      setLocalAssetUrl(null)
      setLocalAssetStorageKey(null)
      setUploadResetKey((value) => value + 1)
    } catch (cause) {
      setSubmitError(cause instanceof Error ? cause.message : t('requestFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mb-3 space-y-3 rounded-xl border border-[var(--glass-border-subtle)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium text-[var(--glass-text-secondary)]">{t('assetSource')}</span>
        <div className="flex rounded-lg bg-[var(--glass-bg-muted)] p-1" role="tablist" aria-label={t('assetSource')}>
          <button
            type="button"
            role="tab"
            aria-selected={sourceMode === 'url'}
            onClick={() => setSourceMode('url')}
            className={`rounded-md px-3 py-1.5 text-xs transition ${sourceMode === 'url' ? 'glass-btn-tone-info' : 'text-[var(--glass-text-secondary)]'}`}
          >
            {t('urlSource')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={sourceMode === 'local'}
            onClick={() => setSourceMode('local')}
            className={`rounded-md px-3 py-1.5 text-xs transition ${sourceMode === 'local' ? 'glass-btn-tone-info' : 'text-[var(--glass-text-secondary)]'}`}
          >
            <AppIcon name="upload" className="mr-1 inline h-3 w-3" />
            {t('localUpload')}
          </button>
        </div>
      </div>

      <input
        value={assetName}
        onChange={(event) => onAssetNameChange(event.target.value)}
        placeholder={t('assetName')}
        className="glass-input w-full text-xs"
      />

      {sourceMode === 'url' ? (
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
          <input value={assetUrl} onChange={(event) => onAssetUrlChange(event.target.value)} placeholder={t('assetUrl')} className="glass-input text-xs" />
          <select value={assetType} onChange={(event) => onAssetTypeChange(event.target.value as MobileCloudAssetType)} className="glass-input text-xs">
            <option value="Image">{t('image')}</option>
            <option value="Video">{t('video')}</option>
            <option value="Audio">{t('audio')}</option>
          </select>
          <button type="button" onClick={() => void create()} disabled={disabled || submitting || !assetName.trim() || !assetUrl.trim()} className="glass-btn-tone-info rounded-lg px-3 py-2 text-xs">
            {submitting ? t('creatingAsset') : t('addAsset')}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <LocalImageUpload
            key={uploadResetKey}
            value={localAssetUrl}
            onChange={(value) => {
              setLocalAssetUrl(value)
              if (!value) setLocalAssetStorageKey(null)
            }}
            onUploaded={(file, result) => {
              setLocalAssetStorageKey(result.key || null)
              if (!assetName.trim()) onAssetNameChange(defaultMobileCloudAssetName(file.name))
            }}
            disabled={disabled || submitting}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] text-[var(--glass-text-tertiary)]">{t('localUploadHint')}</p>
            <button type="button" onClick={() => void create()} disabled={disabled || submitting || !assetName.trim() || !localAssetUrl} className="glass-btn-tone-info rounded-lg px-4 py-2 text-xs">
              {submitting ? t('creatingAsset') : t('addAsset')}
            </button>
          </div>
          {submitError ? <p role="alert" className="rounded-lg bg-[var(--glass-tone-danger-bg)] px-3 py-2 text-xs text-[var(--glass-tone-danger-fg)]">{submitError}</p> : null}
        </div>
      )}
    </div>
  )
}
