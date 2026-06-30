'use client'

import { AppIcon } from '@/components/ui/icons'

type PlatformPageErrorProps = {
  title: string
  message?: string | null
  retryLabel: string
  onRetry: () => void
  className?: string
}

export function PlatformPageError({ title, message, retryLabel, onRetry, className = '' }: PlatformPageErrorProps) {
  return (
    <div className={`glass-surface p-8 text-center ${className}`}>
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--glass-tone-danger-bg)] text-[var(--glass-tone-danger-fg)]">
        <AppIcon name="alert" className="h-6 w-6" />
      </div>
      <h2 className="mb-2 text-lg font-semibold text-[var(--glass-text-primary)]">{title}</h2>
      {message ? <p className="mx-auto mb-5 max-w-xl text-sm text-[var(--glass-text-secondary)]">{message}</p> : null}
      <button type="button" onClick={onRetry} className="glass-btn-base glass-btn-primary mx-auto inline-flex items-center gap-2 px-4 py-2">
        <AppIcon name="refresh" className="h-4 w-4" />
        {retryLabel}
      </button>
    </div>
  )
}

type PlatformAccessDeniedProps = {
  title: string
  message: string
}

export function PlatformAccessDenied({ title, message }: PlatformAccessDeniedProps) {
  return (
    <div className="flex h-[calc(100vh-64px)] flex-col items-center justify-center px-4 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--glass-tone-warning-bg)] text-[var(--glass-tone-warning-fg)]">
        <AppIcon name="lock" className="h-6 w-6" />
      </div>
      <h1 className="mb-3 text-2xl font-bold text-[var(--glass-text-primary)]">{title}</h1>
      <p className="text-[var(--glass-text-secondary)]">{message}</p>
    </div>
  )
}
