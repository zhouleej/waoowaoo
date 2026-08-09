'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'
import { useUploadAssetHubTempMedia } from '@/lib/query/hooks'

const MAX_SIZE = 10 * 1024 * 1024
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

export default function LocalImageUpload({ value, onChange, disabled = false }: { value: string | null; onChange: (value: string | null) => void; disabled?: boolean }) {
  const t = useTranslations('assetModal')
  const inputRef = useRef<HTMLInputElement>(null)
  const upload = useUploadAssetHubTempMedia()
  const [preview, setPreview] = useState(value)
  const [error, setError] = useState('')

  useEffect(() => () => { if (preview?.startsWith('blob:')) URL.revokeObjectURL(preview) }, [preview])

  const selectFile = async (file?: File) => {
    if (!file) return
    setError('')
    if (!IMAGE_TYPES.has(file.type)) { setError(t('upload.invalidType')); return }
    if (file.size > MAX_SIZE) { setError(t('upload.tooLarge')); return }
    const localUrl = URL.createObjectURL(file)
    setPreview(localUrl)
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(new Error(t('errors.uploadFailed')))
        reader.readAsDataURL(file)
      })
      const result = await upload.mutateAsync({ imageBase64: base64 })
      if (!result.url) throw new Error(t('errors.uploadFailed'))
      onChange(result.url)
    } catch (cause) {
      setPreview(value)
      setError(cause instanceof Error ? cause.message : t('errors.uploadFailed'))
    }
  }

  return <div className="space-y-2">
    <div className="flex items-center justify-between">
      <span className="text-sm font-medium text-[var(--glass-tone-info-fg)]">{t('upload.title')}</span>
      <span className="text-xs text-[var(--glass-text-tertiary)]">{t('upload.hint')}</span>
    </div>
    <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" disabled={disabled || upload.isPending} onChange={(event) => { void selectFile(event.target.files?.[0]); event.target.value = '' }} />
    {preview ? <div className="relative h-44 overflow-hidden rounded-lg border border-[var(--glass-stroke-base)]">
      <img src={preview} alt={t('upload.preview')} className="h-full w-full object-contain" />
      <div className="absolute right-2 top-2 flex gap-2">
        <button type="button" onClick={() => inputRef.current?.click()} disabled={disabled || upload.isPending} className="glass-btn-base glass-btn-soft rounded-lg px-3 py-1 text-xs">{t('upload.replace')}</button>
        <button type="button" onClick={() => { setPreview(null); onChange(null) }} disabled={disabled || upload.isPending} className="glass-btn-base glass-btn-soft rounded-lg px-3 py-1 text-xs">{t('upload.remove')}</button>
      </div>
    </div> : <button type="button" onClick={() => inputRef.current?.click()} disabled={disabled || upload.isPending} className="glass-surface-soft flex h-44 w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--glass-stroke-base)] text-sm text-[var(--glass-text-secondary)]">
      <AppIcon name="image" className="h-8 w-8" />{upload.isPending ? t('upload.uploading') : t('upload.choose')}
    </button>}
    {error && <p role="alert" className="text-xs text-[var(--glass-tone-danger-fg)]">{error}</p>}
  </div>
}
