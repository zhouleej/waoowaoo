'use client'

import Image from 'next/image'
import { useSession } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import LanguageSwitcher from './LanguageSwitcher'
import { AppIcon } from '@/components/ui/icons'
import { usePlatformAdminCheck } from '@/hooks/common/usePlatformAdminCheck'
import { Link } from '@/i18n/navigation'
import { buildAuthenticatedHomeTarget } from '@/lib/home/default-route'
import { APP_VERSION } from '@/lib/app-meta'


export default function Navbar() {
  const { data: session, status } = useSession()
  const t = useTranslations('nav')
  const tc = useTranslations('common')
  const downloadLogsHref = '/api/admin/download-logs'
  const { isPlatformAdmin } = usePlatformAdminCheck(status === 'authenticated' && Boolean(session))

  return (
    <>
      <nav className="glass-nav sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <Link href={session ? buildAuthenticatedHomeTarget() : { pathname: '/' }} className="group">
                <Image
                  src="/logo-small.png?v=1"
                  alt={tc('appName')}
                  width={80}
                  height={80}
                  className="object-contain transition-transform group-hover:scale-110"
                />
              </Link>
              <span className="rounded-full border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] px-2.5 py-1 text-[11px] font-semibold text-[var(--glass-text-secondary)]">
                v{APP_VERSION}
              </span>
            </div>
            <div className="flex items-center space-x-6">
              {status === 'loading' ? (
                /* Session 加载中骨架屏 */
                <div className="flex items-center space-x-4">
                  <div className="h-4 w-16 rounded-full bg-[var(--glass-bg-muted)] animate-pulse" />
                  <div className="h-4 w-16 rounded-full bg-[var(--glass-bg-muted)] animate-pulse" />
                  <div className="h-8 w-20 rounded-lg bg-[var(--glass-bg-muted)] animate-pulse" />
                </div>
              ) : session ? (
                <>
                  {isPlatformAdmin && (
                    <div className="hidden xl:flex items-center gap-3">
                      <Link href={{ pathname: '/admin/platform' }} className="text-sm text-[var(--glass-tone-warning-fg)] hover:text-[var(--glass-tone-warning-fg)] font-medium transition-colors flex items-center gap-1" title={t('admin')}>
                        <AppIcon name="unplug" className="w-4 h-4" />{t('admin') || 'Admin'}
                      </Link>
                    </div>
                  )}
                  <Link
                    href={{ pathname: '/workspace' }}
                    className="text-sm text-[var(--glass-text-secondary)] hover:text-[var(--glass-text-primary)] font-medium transition-colors flex items-center gap-1"
                  >
                    <AppIcon name="monitor" className="w-4 h-4" />
                    {t('workspace')}
                  </Link>
                  <Link
                    href={{ pathname: '/workspace/asset-hub' }}
                    className="text-sm text-[var(--glass-text-secondary)] hover:text-[var(--glass-text-primary)] font-medium transition-colors flex items-center gap-1"
                  >
                    <AppIcon name="folderHeart" className="w-4 h-4" />
                    {t('assetHub')}
                  </Link>
                  <Link
                    href={{ pathname: '/profile' }}
                    className="text-sm text-[var(--glass-text-secondary)] hover:text-[var(--glass-text-primary)] font-medium transition-colors flex items-center gap-1"
                    title={t('profile')}
                  >
                    <AppIcon name="userRoundCog" className="w-5 h-5" />
                    {t('profile')}
                  </Link>
                  <LanguageSwitcher />
                  <a
                    href={downloadLogsHref}
                    download
                    className="text-sm text-[var(--glass-text-secondary)] hover:text-[var(--glass-text-primary)] font-medium transition-colors flex items-center gap-1"
                    title={t('downloadLogs')}
                  >
                    <AppIcon name="download" className="w-4 h-4" />
                    {t('downloadLogs')}
                  </a>
                </>

              ) : (
                <>
                  <Link
                    href={{ pathname: '/auth/signin' }}
                    className="text-sm text-[var(--glass-text-secondary)] hover:text-[var(--glass-text-primary)] font-medium transition-colors"
                  >
                    {t('signin')}
                  </Link>
                  <Link
                    href={{ pathname: '/auth/signup' }}
                    className="glass-btn-base glass-btn-primary px-4 py-2 text-sm font-medium"
                  >
                    {t('signup')}
                  </Link>
                  <LanguageSwitcher />
                </>
              )}
            </div>
          </div>
        </div>
      </nav>
    </>
  )
}
