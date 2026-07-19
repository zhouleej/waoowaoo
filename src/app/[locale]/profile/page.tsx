'use client'
import { useEffect, useState } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import Navbar from '@/components/Navbar'
import ApiConfigTab from './components/ApiConfigTab'
import BillingRecordsTab from './components/BillingRecordsTab'
import { AppIcon } from '@/components/ui/icons'
import { useRouter } from '@/i18n/navigation'

interface BalanceData {
  currency: string
  balance: number
  frozenAmount: number
  totalSpent: number
}

export default function ProfilePage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const t = useTranslations('profile')
  const tc = useTranslations('common')

  // 主要分区：扣费记录 / API配置
  const [activeSection, setActiveSection] = useState<'billing' | 'apiConfig'>('apiConfig')
  const [balanceData, setBalanceData] = useState<BalanceData | null>(null)
  const [balanceLoading, setBalanceLoading] = useState(true)

  useEffect(() => {
    if (status === 'loading') return
    if (!session) { router.push({ pathname: '/auth/signin' }); return }
  }, [router, session, status])

  useEffect(() => {
    if (!session) return

    const loadBalance = async () => {
      try {
        const response = await fetch('/api/user/balance')
        if (!response.ok) return

        const data = await response.json() as BalanceData
        setBalanceData(data)
      } finally {
        setBalanceLoading(false)
      }
    }

    void loadBalance()
  }, [session])

  if (status === 'loading' || !session) {
    return (
      <div className="glass-page flex min-h-screen items-center justify-center">
        <div className="text-[var(--glass-text-secondary)]">{tc('loading')}</div>
      </div>
    )
  }

  const formatMoney = (value: number) => balanceData
    ? new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: balanceData.currency,
    }).format(value)
    : null
  const formattedBalance = balanceData ? formatMoney(balanceData.balance) : null

  return (
    <div className="glass-page min-h-screen">
      <Navbar />

      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex min-h-[calc(100vh-140px)] flex-col gap-4 lg:h-[calc(100vh-140px)] lg:flex-row lg:gap-6">

          {/* 左侧侧边栏 */}
          <div className="w-full flex-shrink-0 lg:w-64">
            <div className="glass-surface-elevated h-full flex flex-col p-5">

              {/* 用户信息 */}
              <div className="mb-6">
                <div className="mb-4">
                  <h2 className="font-semibold text-[var(--glass-text-primary)]">{session.user?.name || t('user')}</h2>
                  <p className="text-xs text-[var(--glass-text-tertiary)]">{t('personalAccount')}</p>
                </div>

                {/* 余额卡片 */}
                <div className="glass-surface-soft rounded-2xl border border-[var(--glass-stroke-base)] p-4">
                  <div className="text-xs font-medium text-[var(--glass-text-secondary)]">{t('availableBalance')}</div>
                  <div className="mt-2 text-base font-semibold text-[var(--glass-text-primary)]">
                    {balanceLoading ? tc('loading') : formattedBalance ?? '—'}
                  </div>
                  {!balanceLoading && balanceData && (
                    <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-[var(--glass-stroke-base)] pt-3 text-xs">
                      <div className="min-w-0">
                        <dt className="text-[var(--glass-text-tertiary)]">{t('frozen')}</dt>
                        <dd className="mt-1 truncate text-[var(--glass-text-secondary)]" title={formatMoney(balanceData.frozenAmount) ?? undefined}>{formatMoney(balanceData.frozenAmount)}</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-[var(--glass-text-tertiary)]">{t('totalSpent')}</dt>
                        <dd className="mt-1 truncate text-[var(--glass-text-secondary)]" title={formatMoney(balanceData.totalSpent) ?? undefined}>{formatMoney(balanceData.totalSpent)}</dd>
                      </div>
                    </dl>
                  )}
                </div>
              </div>

              {/* 导航菜单 */}
              <nav className="flex-1 space-y-2">
                <button
                  onClick={() => setActiveSection('apiConfig')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all cursor-pointer ${activeSection === 'apiConfig'
                    ? 'glass-btn-base glass-btn-tone-info'
                    : 'text-[var(--glass-text-secondary)] hover:bg-[var(--glass-bg-muted)]'
                    }`}
                >
                  <AppIcon name="settingsHexAlt" className="w-5 h-5" />
                  <span className="font-medium">{t('apiConfig')}</span>
                </button>

                <button
                  onClick={() => setActiveSection('billing')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all cursor-pointer ${activeSection === 'billing'
                    ? 'glass-btn-base glass-btn-tone-info'
                    : 'text-[var(--glass-text-secondary)] hover:bg-[var(--glass-bg-muted)]'
                    }`}
                >
                  <AppIcon name="receipt" className="w-5 h-5" />
                  <span className="font-medium">{t('billingRecords')}</span>
                </button>
              </nav>
              {/* 退出登录 */}
              <button
                onClick={() => signOut({ callbackUrl: '/' })}
                className="glass-btn-base glass-btn-tone-danger mt-auto flex items-center gap-2 px-4 py-3 text-sm rounded-xl transition-all cursor-pointer"
              >
                <AppIcon name="logout" className="w-4 h-4" />
                {t('logout')}
              </button>
            </div>
          </div>

          {/* 右侧内容区 */}
          <div className="flex-1 min-w-0">
            <div className="glass-surface-elevated h-full flex flex-col">

              {activeSection === 'apiConfig' ? (
                <ApiConfigTab />
              ) : (
                <BillingRecordsTab />
              )}
            </div>
          </div>
        </div>
      </main >
    </div >
  )
}
