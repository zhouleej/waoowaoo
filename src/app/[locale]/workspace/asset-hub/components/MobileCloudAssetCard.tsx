'use client'

import { useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'
import { MediaImageWithLoading } from '@/components/media/MediaImageWithLoading'
import type { MobileCloudAssetType } from './MobileCloudAssetCreator'

export interface MobileCloudDisplayAsset {
  assetId: string
  groupId: string
  assetName: string
  assetType: MobileCloudAssetType
  assetUrl: string
  status: 'PROCESSING' | 'ACTIVE' | 'FAILED'
  errorMessage?: string
}

interface MobileCloudAssetCardProps {
  asset: MobileCloudDisplayAsset
  deleting: boolean
  onDelete: (asset: MobileCloudDisplayAsset) => void
}

function getAssetTypeIcon(type: MobileCloudAssetType) {
  if (type === 'Video') return 'video' as const
  if (type === 'Audio') return 'audioWave' as const
  return 'image' as const
}

function getAssetStatusClassName(status: MobileCloudDisplayAsset['status']) {
  if (status === 'ACTIVE') return 'bg-[var(--glass-tone-success-bg)] text-[var(--glass-tone-success-fg)]'
  if (status === 'FAILED') return 'bg-[var(--glass-tone-danger-bg)] text-[var(--glass-tone-danger-fg)]'
  return 'bg-[var(--glass-tone-warning-bg)] text-[var(--glass-tone-warning-fg)]'
}

export default function MobileCloudAssetCard({ asset, deleting, onDelete }: MobileCloudAssetCardProps) {
  const t = useTranslations('assetHub.mobileCloud')
  const displayName = asset.assetName || asset.assetId
  const icon = getAssetTypeIcon(asset.assetType)

  return (
    <article
      className="group overflow-hidden rounded-xl border border-[var(--glass-border-subtle)] bg-[var(--glass-bg-surface)] transition hover:-translate-y-0.5 hover:border-[var(--glass-tone-info-border)] hover:shadow-md"
      title={displayName}
    >
      <a
        href={asset.assetUrl || undefined}
        target="_blank"
        rel="noreferrer"
        className={asset.assetUrl ? 'block' : 'block cursor-default'}
        onClick={(event) => {
          if (!asset.assetUrl) event.preventDefault()
        }}
      >
        <div className="relative aspect-[16/10] overflow-hidden bg-[var(--glass-bg-muted)]">
          {asset.assetType === 'Image' && asset.assetUrl ? (
            <MediaImageWithLoading
              src={asset.assetUrl}
              alt={displayName}
              containerClassName="h-full w-full"
              className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
            />
          ) : asset.assetType === 'Video' && asset.assetUrl ? (
            <video
              src={asset.assetUrl}
              muted
              playsInline
              preload="metadata"
              className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-[var(--glass-text-tertiary)]">
              <AppIcon name={icon} className="h-8 w-8" />
              <span className="text-[10px]">{asset.assetType}</span>
            </div>
          )}
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-[var(--glass-bg-surface-strong)]/90 px-2 py-1 text-[10px] font-medium text-[var(--glass-text-secondary)] shadow-sm backdrop-blur-sm">
            <AppIcon name={icon} className="h-3 w-3" />
            {asset.assetType}
          </span>
          <span className={`absolute right-2 top-2 rounded-full px-2 py-1 text-[10px] font-medium ${getAssetStatusClassName(asset.status)}`}>
            {asset.status}
          </span>
        </div>
        <div className="p-3 pb-2">
          <p className="truncate text-sm font-medium text-[var(--glass-text-primary)]">{displayName}</p>
          <p className="mt-1 truncate text-[10px] text-[var(--glass-text-tertiary)]">{asset.assetId}</p>
          {asset.status === 'FAILED' && asset.errorMessage && (
            <p className="mt-2 line-clamp-2 text-[10px] leading-4 text-[var(--glass-tone-danger-fg)]">{asset.errorMessage}</p>
          )}
        </div>
      </a>
      <div className="flex justify-end px-3 pb-3">
        <button
          type="button"
          onClick={() => onDelete(asset)}
          disabled={deleting}
          className="glass-btn-base glass-btn-soft inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-[var(--glass-tone-danger-fg)] disabled:cursor-not-allowed disabled:opacity-50"
          aria-label={t('deleteAssetAria', { name: displayName })}
        >
          {deleting ? (
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : (
            <AppIcon name="trash" className="h-3.5 w-3.5" />
          )}
          {deleting ? t('deletingAsset') : t('deleteAsset')}
        </button>
      </div>
    </article>
  )
}
