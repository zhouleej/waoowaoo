'use client'

import Image from 'next/image'
import { useSession } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import WorkspaceSwitcher from '@/components/teams/WorkspaceSwitcher'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import LanguageSwitcher from './LanguageSwitcher'
import { AppIcon } from '@/components/ui/icons'
import { usePlatformAdminCheck } from '@/hooks/common/usePlatformAdminCheck'
import { Link } from '@/i18n/navigation'
import { buildAuthenticatedHomeTarget } from '@/lib/home/default-route'
import { APP_VERSION } from '@/lib/app-meta'

export default function Navbar() {
  const { data: session, status } = useSession()
  const { current } = useWorkspace()
  const downloadLogsHref = '/api/admin/download-logs'
  const t = useTranslations('nav'), tc = useTranslations('common'), tw = useTranslations('teams')
  const { isPlatformAdmin } = usePlatformAdminCheck(status === 'authenticated' && Boolean(session))
  const navLinkClass = 'inline-flex shrink-0 items-center gap-2 rounded-lg px-2 py-3 text-sm font-medium text-[var(--glass-text-secondary)] transition-colors hover:bg-[var(--glass-fill-hover)] hover:text-[var(--glass-text-primary)] whitespace-nowrap'

  return <nav className="glass-nav sticky top-0 z-50">
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div className="flex min-h-16 flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <Link href={session ? buildAuthenticatedHomeTarget() : { pathname: '/' }} className="group shrink-0">
            <Image src="/logo-small.png?v=1" alt={tc('appName')} width={56} height={56} className="object-contain transition-transform group-hover:scale-110" />
          </Link>
          <span className="shrink-0 rounded-full border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] px-2.5 py-1 text-[11px] font-semibold text-[var(--glass-text-secondary)]">v{APP_VERSION}</span>
          {session && <div className="hidden min-w-0 border-l border-[var(--glass-stroke-base)] pl-3 sm:block"><p className="text-[10px] text-[var(--glass-text-tertiary)]">{tw('workspace')}</p><p className="max-w-48 truncate text-xs font-medium" title={current?.organization.name}>{current?.organization.name ?? tw('personalWorkspace')}</p></div>}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-4">
          {status === 'loading' ? <div className="h-8 w-24 animate-pulse rounded-lg bg-[var(--glass-bg-muted)]" /> : session ? <>
            {isPlatformAdmin && <Link href={{ pathname: '/admin/platform' }} className={`${navLinkClass} hidden xl:inline-flex`}><AppIcon name="unplug" className="h-4 w-4" />{t('admin')}</Link>}
            <LanguageSwitcher />
            <a href={downloadLogsHref} download className={navLinkClass} title={t('downloadLogs')}><AppIcon name="download" className="h-4 w-4" /><span className="hidden sm:inline">{t('downloadLogs')}</span></a>
          </> : <>
            <Link href={{ pathname: '/auth/signin' }} className={navLinkClass}>{t('signin')}</Link>
            <Link href={{ pathname: '/auth/signup' }} className="glass-btn-base glass-btn-primary px-4 py-2 text-sm">{t('signup')}</Link>
            <LanguageSwitcher />
          </>}
        </div>
      </div>
      {session && <div aria-label={tw('workspaceNavigation')} className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-[var(--glass-stroke-base)] py-2">
        <WorkspaceSwitcher />
        <span aria-hidden="true" className="mx-1 hidden h-5 w-px bg-[var(--glass-stroke-base)] md:block" />
        <div className="flex flex-wrap items-center gap-1 sm:gap-3">
          <Link href={{ pathname: '/workspace/inspiration-video' }} className={navLinkClass}><AppIcon name="sparkles" className="h-4 w-4" />{t('inspirationVideo')}</Link>
          <Link href={{ pathname: '/workspace/asset-hub' }} className={navLinkClass}><AppIcon name="folderHeart" className="h-4 w-4" />{t('assetHub')}</Link>
          <Link href={{ pathname: '/profile' }} className={navLinkClass}><AppIcon name="userRoundCog" className="h-4 w-4" />{t('profile')}</Link>
        </div>
        <p className="w-full truncate px-2 text-xs text-[var(--glass-text-secondary)] sm:hidden">{tw('workspace')} · {current?.organization.name ?? tw('personalWorkspace')}</p>
      </div>}
    </div>
  </nav>
}
