'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import Navbar from '@/components/Navbar'
import ConfirmDialog from '@/components/ConfirmDialog'
import { getPlatformErrorMessage } from '@/components/platform/errors'
import { PlatformAccessDenied, PlatformPageError } from '@/components/platform/PlatformPageState'
import { AppIcon } from '@/components/ui/icons'
import { Link, useRouter } from '@/i18n/navigation'
import { apiFetch, apiVoid, throwIfNotOk } from '@/lib/api-fetch'
import { getSubscriptionEmptyState } from '@/lib/saas/subscription-page-state'
import { useToast } from '@/contexts/ToastContext'
import { usePlatformAdminCheck } from '@/hooks/common/usePlatformAdminCheck'

type TabKey = 'plans' | 'subscriptions' | 'orders' | 'invoices'

interface Pagination { page: number; limit: number; total: number; totalPages: number }
interface OrganizationOption {
  id: string
  name: string
  slug: string
  currentSubscription?: { id: string; status: string; plan?: { name?: string } } | null
}
interface PlanEntitlement { id?: string; key: string; value: unknown }
interface PricingPlan {
  id: string
  code: string
  name: string
  description?: string | null
  price: number
  currency: string
  billingCycle: string
  status: string
  sortOrder: number
  entitlements?: PlanEntitlement[]
  _count?: { subscriptions?: number }
}
interface Subscription {
  id: string
  status: string
  autoRenew: boolean
  seats: number
  currentPeriodEnd?: string | null
  organization?: OrganizationOption
  plan?: PricingPlan
}
interface BillingOrder {
  id: string
  orderNo: string
  type: string
  status: string
  amount: number
  currency: string
  createdAt: string
  organization?: OrganizationOption
  plan?: PricingPlan | null
  invoice?: { status: string } | null
}
interface BillingInvoice {
  id: string
  invoiceNo: string
  title: string
  status: string
  amount: number
  createdAt: string
  organization?: OrganizationOption
  order?: { orderNo: string } | null
}

const emptyPagination: Pagination = { page: 1, limit: 10, total: 0, totalPages: 1 }
const entitlementKeys = ['memberLimit', 'monthlyCredits', 'modelAccess', 'taskTypes', 'overagePolicy']
const statusFilterOptions: Record<TabKey, string[]> = {
  plans: ['active', 'inactive'],
  subscriptions: ['trialing', 'active', 'past_due', 'canceled', 'expired'],
  orders: ['pending', 'paid', 'canceled', 'refunded', 'failed'],
  invoices: ['pending', 'issued', 'voided'],
}
const statusTranslationKeys: Record<string, string> = {
  trialing: 'trialing', active: 'active', past_due: 'pastDue', canceled: 'canceled', expired: 'expired',
  inactive: 'inactive', pending: 'pending', paid: 'paid', refunded: 'refunded', failed: 'failed',
  issued: 'issued', voided: 'voided',
}
const billingCycleTranslationKeys: Record<string, string> = { monthly: 'monthly', yearly: 'yearly' }
const orderTypeTranslationKeys: Record<string, string> = {
  subscription: 'subscriptionOrder', renewal: 'renewalOrder', upgrade: 'upgradeOrder', recharge: 'rechargeOrder', adjustment: 'adjustmentOrder',
}

function useDebouncedValue(value: string, delay = 360) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(timer)
  }, [delay, value])
  return debounced
}

function money(value: number, currency = 'CNY') {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value || 0)
}

function statusLabel(t: ReturnType<typeof useTranslations>, status: string) {
  return t(statusTranslationKeys[status] || 'unknownStatus')
}

function billingCycleLabel(t: ReturnType<typeof useTranslations>, cycle: string) {
  return t(billingCycleTranslationKeys[cycle] || 'unknownBillingCycle')
}

function orderTypeLabel(t: ReturnType<typeof useTranslations>, type: string) {
  return t(orderTypeTranslationKeys[type] || 'unknownOrderType')
}

export default function PlatformBillingPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const t = useTranslations('platform')
  const tc = useTranslations('common')
  const { showToast } = useToast()
  const [activeTab, setActiveTab] = useState<TabKey>('plans')
  const [searchInput, setSearchInput] = useState('')
  const debouncedSearch = useDebouncedValue(searchInput)
  const [statusFilter, setStatusFilter] = useState('')
  const [organizationFilter, setOrganizationFilter] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [plans, setPlans] = useState<PricingPlan[]>([])
  const [availablePlans, setAvailablePlans] = useState<PricingPlan[]>([])
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [orders, setOrders] = useState<BillingOrder[]>([])
  const [invoices, setInvoices] = useState<BillingInvoice[]>([])
  const [organizations, setOrganizations] = useState<OrganizationOption[]>([])
  const [organizationTotal, setOrganizationTotal] = useState(0)
  const [organizationsLoading, setOrganizationsLoading] = useState(false)
  const [organizationsError, setOrganizationsError] = useState<string | null>(null)
  const [pagination, setPagination] = useState<Pagination>(emptyPagination)
  const [showPlanEditor, setShowPlanEditor] = useState(false)
  const [editingPlan, setEditingPlan] = useState<PricingPlan | null>(null)
  const [planForm, setPlanForm] = useState({ code: '', name: '', price: '0', billingCycle: 'monthly', status: 'active', sortOrder: '0', description: '', memberLimit: '10', monthlyCredits: '1000', modelAccess: 'standard', taskTypes: 'image,video', overagePolicy: 'block' })
  const [savingPlan, setSavingPlan] = useState(false)
  const [subscriptionForm, setSubscriptionForm] = useState({ organizationId: '', planId: '', seats: '1', status: 'active', autoRenew: false })
  const [creatingSubscription, setCreatingSubscription] = useState(false)
  const [confirmAction, setConfirmAction] = useState<{ title: string; message: string; onConfirm: () => void; type?: 'danger' | 'warning' | 'info' } | null>(null)

  const {
    isPlatformAdmin,
    loading: platformAdminLoading,
    error: platformAdminError,
    retry: retryPlatformAdminCheck,
  } = usePlatformAdminCheck(status === 'authenticated' && Boolean(session))

  useEffect(() => {
    if (status === 'loading') return
    if (!session) router.push({ pathname: '/auth/signin' })
  }, [router, session, status])

  const loadOrganizations = useCallback(async () => {
    if (!isPlatformAdmin) return
    setOrganizationsLoading(true)
    setOrganizationsError(null)
    try {
      const res = await apiFetch('/api/platform/organizations?limit=100')
      await throwIfNotOk(res, t('loadFailed'))
      const payload: unknown = await res.json()
      if (!payload || typeof payload !== 'object' || !Array.isArray((payload as { data?: unknown }).data)) {
        throw new Error(t('invalidResponse'))
      }
      const parsed = payload as { data: OrganizationOption[]; pagination?: { total?: number } }
      setOrganizations(parsed.data)
      setOrganizationTotal(typeof parsed.pagination?.total === 'number' ? parsed.pagination.total : parsed.data.length)
    } catch (error) {
      setOrganizationsError(getPlatformErrorMessage(error, t('organizationsLoadFailed')))
    } finally {
      setOrganizationsLoading(false)
    }
  }, [isPlatformAdmin, t])

  const fetchTab = useCallback(async (page = 1, tab: TabKey = activeTab) => {
    if (!isPlatformAdmin) return
    setLoading(true)
    setLoadError(null)
    try {
      const params = new URLSearchParams({ page: String(page), limit: '10' })
      if (statusFilter) params.set('status', statusFilter)
      if (organizationFilter && tab !== 'plans') params.set('organizationId', organizationFilter)
      if (debouncedSearch && tab === 'plans') params.set('search', debouncedSearch)
      const res = await apiFetch(`/api/platform/${tab}?${params.toString()}`)
      await throwIfNotOk(res, t('loadFailed'))
      const payload: unknown = await res.json()
      if (!payload || typeof payload !== 'object' || !Array.isArray((payload as { data?: unknown }).data)) {
        throw new Error(t('invalidResponse'))
      }
      const data = payload as { data: unknown[]; pagination?: Pagination }
      const rows = data.data
      if (tab === 'plans') setPlans(rows as PricingPlan[])
      if (tab === 'subscriptions') setSubscriptions(rows as Subscription[])
      if (tab === 'orders') setOrders(rows as BillingOrder[])
      if (tab === 'invoices') setInvoices(rows as BillingInvoice[])
      setPagination(data.pagination || emptyPagination)
    } catch (error) {
      const message = getPlatformErrorMessage(error, t('loadFailed'))
      setLoadError(message)
      showToast(message, 'error')
    } finally {
      setLoading(false)
    }
  }, [activeTab, debouncedSearch, isPlatformAdmin, organizationFilter, showToast, statusFilter, t])

  useEffect(() => { void loadOrganizations() }, [loadOrganizations])
  useEffect(() => { void fetchTab(1) }, [fetchTab])
  useEffect(() => {
    if (activeTab === 'subscriptions' && isPlatformAdmin) {
      apiFetch('/api/platform/plans?limit=100&status=active')
        .then(async (res) => {
          await throwIfNotOk(res, t('loadFailed'))
          return res.json() as Promise<{ data?: unknown }>
        })
        .then((data) => {
          if (!Array.isArray(data?.data)) throw new Error(t('invalidResponse'))
          setAvailablePlans(data.data as PricingPlan[])
        })
        .catch((error) => {
          const message = getPlatformErrorMessage(error, t('loadFailed'))
          setLoadError(message)
          showToast(message, 'error')
        })
    }
  }, [activeTab, isPlatformAdmin, showToast, t])

  const tabItems = useMemo(() => ([
    { key: 'plans' as const, label: t('plans'), icon: 'diamond' as const },
    { key: 'subscriptions' as const, label: t('subscriptions'), icon: 'clipboardCheck' as const },
    { key: 'orders' as const, label: t('orders'), icon: 'receipt' as const },
    { key: 'invoices' as const, label: t('invoices'), icon: 'fileText' as const },
  ]), [t])

  const openPlanEditor = (plan?: PricingPlan) => {
    const entitlements = Object.fromEntries((plan?.entitlements || []).map((item) => [item.key, String(item.value ?? '')]))
    setEditingPlan(plan || null)
    setShowPlanEditor(true)
    setPlanForm({
      code: plan?.code || '',
      name: plan?.name || '',
      price: String(plan?.price ?? 0),
      billingCycle: plan?.billingCycle || 'monthly',
      status: plan?.status || 'active',
      sortOrder: String(plan?.sortOrder ?? 0),
      description: plan?.description || '',
      memberLimit: entitlements.memberLimit || '10',
      monthlyCredits: entitlements.monthlyCredits || '1000',
      modelAccess: entitlements.modelAccess || 'standard',
      taskTypes: entitlements.taskTypes || 'image,video',
      overagePolicy: entitlements.overagePolicy || 'block',
    })
  }

  const closePlanEditor = () => {
    setShowPlanEditor(false)
    setEditingPlan(null)
    setPlanForm({ code: '', name: '', price: '0', billingCycle: 'monthly', status: 'active', sortOrder: '0', description: '', memberLimit: '10', monthlyCredits: '1000', modelAccess: 'standard', taskTypes: 'image,video', overagePolicy: 'block' })
  }

  const savePlan = async () => {
    if (!planForm.code.trim() || !planForm.name.trim()) {
      showToast(t('planRequired'), 'warning')
      return
    }
    setSavingPlan(true)
    try {
      const entitlements = Object.fromEntries(entitlementKeys.map((key) => [key, planForm[key as keyof typeof planForm]]))
      const body: Record<string, unknown> = { ...planForm, price: Number(planForm.price), sortOrder: Number(planForm.sortOrder), entitlements }
      if (editingPlan && (editingPlan._count?.subscriptions || 0) > 0) {
        delete body.code
        delete body.price
        delete body.billingCycle
      }
      const endpoint = editingPlan ? `/api/platform/plans/${editingPlan.id}` : '/api/platform/plans'
      await apiVoid(endpoint, { method: editingPlan ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      showToast(editingPlan ? t('planUpdated') : t('planCreated'), 'success')
      closePlanEditor()
      await fetchTab(pagination.page)
    } catch (error) {
      showToast(getPlatformErrorMessage(error, t('saveFailed')), 'error')
    } finally {
      setSavingPlan(false)
    }
  }

  const togglePlanStatus = (plan: PricingPlan) => {
    const nextStatus = plan.status === 'active' ? 'inactive' : 'active'
    setConfirmAction({
      title: nextStatus === 'active' ? t('enablePlan') : t('disablePlan'),
      message: t('confirmPlanStatus', { name: plan.name }),
      type: nextStatus === 'active' ? 'info' : 'warning',
      onConfirm: async () => {
        setConfirmAction(null)
        try {
          await apiVoid(`/api/platform/plans/${plan.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: nextStatus }) })
          showToast(t('operationSuccess'), 'success')
          await fetchTab(pagination.page)
        } catch (error) {
          showToast(getPlatformErrorMessage(error, t('saveFailed')), 'error')
        }
      },
    })
  }

  const submitSubscription = async () => {
    if (!subscriptionForm.organizationId || !subscriptionForm.planId) {
      showToast(t('subscriptionRequired'), 'warning')
      return
    }
    setCreatingSubscription(true)
    try {
      await apiVoid('/api/platform/subscriptions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...subscriptionForm, seats: Number(subscriptionForm.seats) }) })
      showToast(t('subscriptionCreated'), 'success')
      setSubscriptionForm({ organizationId: '', planId: '', seats: '1', status: 'active', autoRenew: false })
      setActiveTab('subscriptions')
      await Promise.all([fetchTab(1, 'subscriptions'), loadOrganizations()])
    } catch (error) {
      showToast(getPlatformErrorMessage(error, t('saveFailed')), 'error')
    } finally {
      setCreatingSubscription(false)
    }
  }

  const createSubscription = () => {
    const organization = organizations.find((item) => item.id === subscriptionForm.organizationId)
    if (organization?.currentSubscription) {
      setConfirmAction({
        title: t('replaceSubscription'),
        message: t('replaceSubscriptionConfirm', { name: organization.name, plan: organization.currentSubscription.plan?.name || statusLabel(t, organization.currentSubscription.status) }),
        type: 'warning',
        onConfirm: () => {
          setConfirmAction(null)
          void submitSubscription()
        },
      })
      return
    }
    void submitSubscription()
  }

  if (status === 'loading' || !session || platformAdminLoading) return <div className="min-h-screen bg-[var(--glass-bg-root)]"><Navbar /><div className="flex h-[calc(100vh-64px)] items-center justify-center text-[var(--glass-text-secondary)]">{t('loading')}</div></div>
  if (platformAdminError) return <div className="min-h-screen bg-[var(--glass-bg-root)]"><Navbar /><div className="mx-auto max-w-3xl px-4 py-16"><PlatformPageError title={t('platformAdminCheckFailed')} message={platformAdminError.message} retryLabel={t('retry')} onRetry={retryPlatformAdminCheck} /></div></div>
  if (!isPlatformAdmin) return <div className="min-h-screen bg-[var(--glass-bg-root)]"><Navbar /><PlatformAccessDenied title={t('accessDeniedTitle')} message={t('noPermission')} /></div>

  return (
    <div className="min-h-screen bg-[var(--glass-bg-root)]">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-[var(--glass-tone-info-fg)]">{t('saasOperations')}</p>
            <h1 className="text-3xl font-bold text-[var(--glass-text-primary)]">{t('billingCenter')}</h1>
            <p className="mt-2 text-sm text-[var(--glass-text-secondary)]">{t('billingCenterDesc')}</p>
          </div>
          <div className="flex items-center gap-3">
            <Link href={{ pathname: '/admin/platform' }} className="glass-btn-base glass-btn-secondary px-4 py-2">
              <AppIcon name="chevronLeft" className="mr-2 h-4 w-4" />{t('back')}
            </Link>
            <button onClick={() => openPlanEditor()} className="glass-btn-base glass-btn-primary px-4 py-2"><AppIcon name="plus" className="mr-2 h-4 w-4" />{t('newPlan')}</button>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {tabItems.map((tab) => (
            <button key={tab.key} onClick={() => { setActiveTab(tab.key); setStatusFilter(''); setSearchInput(''); setOrganizationFilter('') }} aria-pressed={activeTab === tab.key} className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition-all ${activeTab === tab.key ? 'border-[var(--glass-tone-info-fg)]/40 bg-[var(--glass-tone-info-bg)] text-[var(--glass-tone-info-fg)] shadow-[0_10px_30px_-22px_var(--glass-tone-info-fg)]' : 'glass-surface border-transparent hover:brightness-105'}`}>
              <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${activeTab === tab.key ? 'bg-[var(--glass-tone-info-fg)]/15' : 'bg-[var(--glass-bg-muted)]'}`}><AppIcon name={tab.icon} className={`h-5 w-5 ${activeTab === tab.key ? 'text-[var(--glass-tone-info-fg)]' : 'text-[var(--glass-text-secondary)]'}`} /></span>
              <span className={`font-semibold ${activeTab === tab.key ? 'text-[var(--glass-tone-info-fg)]' : 'text-[var(--glass-text-primary)]'}`}>{tab.label}</span>
            </button>
          ))}
        </div>

        <div className="glass-surface mb-6 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            {activeTab === 'plans' ? <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder={t('searchPlans')} className="glass-input-base w-full px-3 py-2 lg:max-w-sm" /> : <select value={organizationFilter} onChange={(e) => setOrganizationFilter(e.target.value)} className="glass-input-base w-full px-3 py-2 lg:max-w-sm"><option value="">{t('allOrganizations')}</option>{organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}</select>}
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="glass-input-base w-full px-3 py-2 lg:w-48"><option value="">{t('allStatus')}</option>{statusFilterOptions[activeTab].map((value) => <option key={value} value={value}>{statusLabel(t, value)}</option>)}</select>
            <button onClick={() => void fetchTab(1)} disabled={loading} className="glass-btn-base glass-btn-secondary px-4 py-2 disabled:opacity-50"><AppIcon name="refresh" className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />{t('refresh')}</button>
          </div>
        </div>

        {activeTab === 'subscriptions' && (
          <>
            <div className="mb-6 grid gap-3 sm:grid-cols-3">
              <SummaryCard label={t('organizationTotal')} value={organizationTotal} />
              <SummaryCard label={t('activePlanTotal')} value={availablePlans.length} />
              <SummaryCard label={t('subscriptionTotal')} value={pagination.total} />
            </div>
            {organizationsError ? <div className="glass-surface mb-6 flex flex-col gap-3 border border-[var(--glass-tone-danger-fg)]/30 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium text-[var(--glass-tone-danger-fg)]">{t('organizationsLoadFailed')}</p><p className="text-sm text-[var(--glass-text-secondary)]">{organizationsError}</p></div><button onClick={() => void loadOrganizations()} className="glass-btn-base glass-btn-secondary px-4 py-2">{t('retryOrganizations')}</button></div> : null}
            <div className="glass-surface mb-6 p-4">
              <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold text-[var(--glass-text-primary)]">{t('createSubscription')}</h2>{organizationsLoading ? <span className="text-sm text-[var(--glass-text-secondary)]">{t('organizationsLoading')}</span> : null}</div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <select value={subscriptionForm.organizationId} onChange={(e) => setSubscriptionForm((prev) => ({ ...prev, organizationId: e.target.value }))} disabled={organizationsLoading || Boolean(organizationsError)} className="glass-input-base px-3 py-2 xl:col-span-2 disabled:opacity-60"><option value="">{t('selectOrganization')}</option>{organizations.map((org) => <option key={org.id} value={org.id}>{org.name} · {org.currentSubscription ? t('organizationSubscribed', { plan: org.currentSubscription.plan?.name || org.currentSubscription.status }) : t('organizationUnsubscribed')}</option>)}</select>
                <select value={subscriptionForm.planId} onChange={(e) => setSubscriptionForm((prev) => ({ ...prev, planId: e.target.value }))} className="glass-input-base px-3 py-2"><option value="">{t('selectPlan')}</option>{availablePlans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select>
                <input value={subscriptionForm.seats} onChange={(e) => setSubscriptionForm((prev) => ({ ...prev, seats: e.target.value }))} type="number" min="1" className="glass-input-base px-3 py-2" placeholder={t('seats')} />
                <button onClick={createSubscription} disabled={creatingSubscription || !subscriptionForm.organizationId || !subscriptionForm.planId} className="glass-btn-base glass-btn-primary px-4 py-2 disabled:cursor-not-allowed disabled:opacity-50">{creatingSubscription ? t('saving') : t('createSubscription')}</button>
              </div>
            </div>
          </>
        )}

        <div className="glass-surface overflow-hidden">
          {loadError ? <PlatformPageError title={t('requestFailed')} message={loadError} retryLabel={t('retry')} onRetry={() => void fetchTab(pagination.page || 1)} /> : loading ? <div className="p-10 text-center text-[var(--glass-text-secondary)]">{t('loading')}</div> : (
            <div className="overflow-x-auto">
              {activeTab === 'plans' && <PlansTable plans={plans} t={t} onEdit={openPlanEditor} onToggle={togglePlanStatus} />}
              {activeTab === 'subscriptions' && <SubscriptionsTable rows={subscriptions} total={pagination.total} isFiltered={Boolean(statusFilter || organizationFilter)} organizationCount={organizationTotal} activePlanCount={availablePlans.length} t={t} onSelectPlans={() => setActiveTab('plans')} />}
              {activeTab === 'orders' && <OrdersTable rows={orders} t={t} />}
              {activeTab === 'invoices' && <InvoicesTable rows={invoices} t={t} />}
            </div>
          )}
          <div className="flex flex-col gap-3 border-t border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)]/30 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm text-[var(--glass-text-tertiary)]">{t('paginationSummary', { total: pagination.total, page: pagination.page, totalPages: pagination.totalPages })}</span>
            <div className="flex gap-2"><button onClick={() => void fetchTab(pagination.page - 1)} disabled={pagination.page <= 1 || loading} className="glass-btn-base glass-btn-secondary px-3 py-1.5 text-sm disabled:opacity-50">{t('prevPage')}</button><button onClick={() => void fetchTab(pagination.page + 1)} disabled={pagination.page >= pagination.totalPages || loading} className="glass-btn-base glass-btn-secondary px-3 py-1.5 text-sm disabled:opacity-50">{t('nextPage')}</button></div>
          </div>
        </div>
      </main>

      {showPlanEditor ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-6">
          <div className="glass-overlay absolute inset-0" onClick={closePlanEditor} />
          <div className="glass-surface-modal relative z-10 flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-[var(--glass-stroke-base)] px-6 py-4"><h2 className="text-lg font-semibold text-[var(--glass-text-primary)]">{editingPlan ? t('editPlan') : t('newPlan')}</h2><button onClick={closePlanEditor} className="glass-btn-base glass-btn-ghost h-9 w-9"><AppIcon name="close" className="h-5 w-5" /></button></div>
            <div className="grid gap-4 overflow-y-auto px-6 py-5 md:grid-cols-2">
              <Field label={t('planCode')} value={planForm.code} onChange={(value) => setPlanForm((prev) => ({ ...prev, code: value }))} disabled={!!editingPlan} />
              <Field label={t('planName')} value={planForm.name} onChange={(value) => setPlanForm((prev) => ({ ...prev, name: value }))} />
              <Field label={t('price')} value={planForm.price} onChange={(value) => setPlanForm((prev) => ({ ...prev, price: value }))} type="number" disabled={!!editingPlan && (editingPlan._count?.subscriptions || 0) > 0} />
              <Field label={t('sortOrder')} value={planForm.sortOrder} onChange={(value) => setPlanForm((prev) => ({ ...prev, sortOrder: value }))} type="number" />
              <SelectField label={t('billingCycle')} value={planForm.billingCycle} onChange={(value) => setPlanForm((prev) => ({ ...prev, billingCycle: value }))} disabled={!!editingPlan && (editingPlan._count?.subscriptions || 0) > 0} options={[["monthly", t('monthly')], ["yearly", t('yearly')]]} />
              <SelectField label={t('status')} value={planForm.status} onChange={(value) => setPlanForm((prev) => ({ ...prev, status: value }))} options={[['active', t('active')], ['inactive', t('inactive')]]} />
              <Field label={t('memberLimit')} value={planForm.memberLimit} onChange={(value) => setPlanForm((prev) => ({ ...prev, memberLimit: value }))} type="number" />
              <Field label={t('monthlyCredits')} value={planForm.monthlyCredits} onChange={(value) => setPlanForm((prev) => ({ ...prev, monthlyCredits: value }))} type="number" />
              <Field label={t('modelAccess')} value={planForm.modelAccess} onChange={(value) => setPlanForm((prev) => ({ ...prev, modelAccess: value }))} />
              <Field label={t('taskTypes')} value={planForm.taskTypes} onChange={(value) => setPlanForm((prev) => ({ ...prev, taskTypes: value }))} />
              <SelectField label={t('overagePolicy')} value={planForm.overagePolicy} onChange={(value) => setPlanForm((prev) => ({ ...prev, overagePolicy: value }))} options={[['block', t('blockOverage')], ['balance', t('balanceOverage')]]} />
              <Field label={t('description')} value={planForm.description} onChange={(value) => setPlanForm((prev) => ({ ...prev, description: value }))} />
            </div>
            <div className="flex justify-end gap-3 border-t border-[var(--glass-stroke-base)] px-6 py-4"><button onClick={closePlanEditor} className="glass-btn-base glass-btn-secondary px-4 py-2">{tc('cancel')}</button><button onClick={savePlan} disabled={savingPlan} className="glass-btn-base glass-btn-primary px-4 py-2 disabled:opacity-50">{savingPlan ? t('saving') : t('save')}</button></div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog show={!!confirmAction} title={confirmAction?.title || ''} message={confirmAction?.message || ''} type={confirmAction?.type || 'warning'} confirmText={t('confirm')} cancelText={tc('cancel')} onConfirm={() => confirmAction?.onConfirm()} onCancel={() => setConfirmAction(null)} />
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', disabled = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; disabled?: boolean }) {
  return <label className="block"><span className="mb-1 block text-sm text-[var(--glass-text-secondary)]">{label}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} className="glass-input-base w-full px-3 py-2 disabled:opacity-60" /></label>
}

function SelectField({ label, value, onChange, options, disabled = false }: { label: string; value: string; onChange: (value: string) => void; options: Array<[string, string]>; disabled?: boolean }) {
  return <label className="block"><span className="mb-1 block text-sm text-[var(--glass-text-secondary)]">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} className="glass-input-base w-full px-3 py-2 disabled:opacity-60">{options.map(([key, labelText]) => <option key={key} value={key}>{labelText}</option>)}</select></label>
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return <div className="glass-surface p-4"><div className="text-sm text-[var(--glass-text-secondary)]">{label}</div><div className="mt-1 text-2xl font-bold text-[var(--glass-text-primary)]">{value}</div></div>
}

function Empty({ label }: { label: string }) { return <div className="p-10 text-center text-[var(--glass-text-secondary)]">{label}</div> }

function SubscriptionEmpty({ state, t, onSelectPlans }: { state: NonNullable<ReturnType<typeof getSubscriptionEmptyState>>; t: ReturnType<typeof useTranslations>; onSelectPlans: () => void }) {
  if (state === 'no-organizations') return <div className="p-10 text-center"><h3 className="font-semibold text-[var(--glass-text-primary)]">{t('noOrganizationsForSubscription')}</h3><p className="mx-auto mt-2 max-w-xl text-sm text-[var(--glass-text-secondary)]">{t('noOrganizationsForSubscriptionDesc')}</p><Link href={{ pathname: '/admin/platform/organizations' }} className="glass-btn-base glass-btn-primary mt-5 inline-flex px-4 py-2">{t('createOrganizationFirst')}</Link></div>
  if (state === 'no-active-plans') return <div className="p-10 text-center"><h3 className="font-semibold text-[var(--glass-text-primary)]">{t('noActivePlansForSubscription')}</h3><p className="mx-auto mt-2 max-w-xl text-sm text-[var(--glass-text-secondary)]">{t('noActivePlansForSubscriptionDesc')}</p><button onClick={onSelectPlans} className="glass-btn-base glass-btn-primary mt-5 px-4 py-2">{t('goToPlans')}</button></div>
  return <div className="p-10 text-center"><h3 className="font-semibold text-[var(--glass-text-primary)]">{t('readyToCreateSubscription')}</h3><p className="mx-auto mt-2 max-w-xl text-sm text-[var(--glass-text-secondary)]">{t('readyToCreateSubscriptionDesc')}</p></div>
}

function PlansTable({ plans, t, onEdit, onToggle }: { plans: PricingPlan[]; t: ReturnType<typeof useTranslations>; onEdit: (plan: PricingPlan) => void; onToggle: (plan: PricingPlan) => void }) {
  if (!plans.length) return <Empty label={t('noPlans')} />
  return <table className="w-full min-w-[900px]"><thead className="bg-[var(--glass-bg-muted)]"><tr><Th>{t('planName')}</Th><Th>{t('price')}</Th><Th>{t('entitlements')}</Th><Th>{t('subscribers')}</Th><Th>{t('status')}</Th><Th>{t('actions')}</Th></tr></thead><tbody className="divide-y divide-[var(--glass-stroke-base)]">{plans.map((plan) => <tr key={plan.id} className="hover:bg-[var(--glass-bg-muted)]/40"><Td><div className="font-semibold text-[var(--glass-text-primary)]">{plan.name}</div><div className="font-mono text-xs text-[var(--glass-text-tertiary)]">{plan.code}</div></Td><Td>{money(plan.price, plan.currency)} / {billingCycleLabel(t, plan.billingCycle)}</Td><Td><div className="flex flex-wrap gap-1">{(plan.entitlements || []).slice(0, 4).map((item) => <span key={item.key} className="rounded-full bg-[var(--glass-bg-muted)] px-2 py-0.5 text-xs text-[var(--glass-text-secondary)]">{item.key}: {String(item.value)}</span>)}</div></Td><Td>{plan._count?.subscriptions || 0}</Td><Td><StatusBadge status={plan.status} label={statusLabel(t, plan.status)} /></Td><Td><div className="flex gap-2"><button onClick={() => onEdit(plan)} className="glass-btn-base glass-btn-secondary px-3 py-1.5 text-xs">{t('edit')}</button><button onClick={() => onToggle(plan)} className="glass-btn-base glass-btn-tone-warning px-3 py-1.5 text-xs">{plan.status === 'active' ? t('disable') : t('enable')}</button></div></Td></tr>)}</tbody></table>
}

function SubscriptionsTable({ rows, total, isFiltered, organizationCount, activePlanCount, t, onSelectPlans }: { rows: Subscription[]; total: number; isFiltered: boolean; organizationCount: number; activePlanCount: number; t: ReturnType<typeof useTranslations>; onSelectPlans: () => void }) {
  if (!rows.length && (isFiltered || total > 0)) return <Empty label={t('noMatchingSubscriptions')} />
  const emptyState = getSubscriptionEmptyState({ organizationCount, activePlanCount, subscriptionCount: total })
  if (emptyState) return <SubscriptionEmpty state={emptyState} t={t} onSelectPlans={onSelectPlans} />
  return <table className="w-full min-w-[820px]"><thead className="bg-[var(--glass-bg-muted)]"><tr><Th>{t('organization')}</Th><Th>{t('planName')}</Th><Th>{t('seats')}</Th><Th>{t('periodEnd')}</Th><Th>{t('autoRenew')}</Th><Th>{t('status')}</Th></tr></thead><tbody className="divide-y divide-[var(--glass-stroke-base)]">{rows.map((row) => <tr key={row.id} className="hover:bg-[var(--glass-bg-muted)]/40"><Td>{row.organization?.name || '-'}</Td><Td>{row.plan?.name || '-'}</Td><Td>{row.seats}</Td><Td>{row.currentPeriodEnd ? new Date(row.currentPeriodEnd).toLocaleDateString() : '-'}</Td><Td>{row.autoRenew ? t('yes') : t('no')}</Td><Td><StatusBadge status={row.status} label={statusLabel(t, row.status)} /></Td></tr>)}</tbody></table>
}

function OrdersTable({ rows, t }: { rows: BillingOrder[]; t: ReturnType<typeof useTranslations> }) {
  if (!rows.length) return <Empty label={t('noOrders')} />
  return <table className="w-full min-w-[900px]"><thead className="bg-[var(--glass-bg-muted)]"><tr><Th>{t('orderNo')}</Th><Th>{t('organization')}</Th><Th>{t('type')}</Th><Th>{t('amount')}</Th><Th>{t('invoice')}</Th><Th>{t('createdAt')}</Th><Th>{t('status')}</Th></tr></thead><tbody className="divide-y divide-[var(--glass-stroke-base)]">{rows.map((row) => <tr key={row.id} className="hover:bg-[var(--glass-bg-muted)]/40"><Td><span className="font-mono">{row.orderNo}</span></Td><Td>{row.organization?.name || '-'}</Td><Td>{orderTypeLabel(t, row.type)}</Td><Td>{money(row.amount, row.currency)}</Td><Td>{row.invoice?.status ? <StatusBadge status={row.invoice.status} label={statusLabel(t, row.invoice.status)} /> : '-'}</Td><Td>{new Date(row.createdAt).toLocaleDateString()}</Td><Td><StatusBadge status={row.status} label={statusLabel(t, row.status)} /></Td></tr>)}</tbody></table>
}

function InvoicesTable({ rows, t }: { rows: BillingInvoice[]; t: ReturnType<typeof useTranslations> }) {
  if (!rows.length) return <Empty label={t('noInvoices')} />
  return <table className="w-full min-w-[860px]"><thead className="bg-[var(--glass-bg-muted)]"><tr><Th>{t('invoiceNo')}</Th><Th>{t('titleField')}</Th><Th>{t('organization')}</Th><Th>{t('orderNo')}</Th><Th>{t('amount')}</Th><Th>{t('createdAt')}</Th><Th>{t('status')}</Th></tr></thead><tbody className="divide-y divide-[var(--glass-stroke-base)]">{rows.map((row) => <tr key={row.id} className="hover:bg-[var(--glass-bg-muted)]/40"><Td><span className="font-mono">{row.invoiceNo}</span></Td><Td>{row.title}</Td><Td>{row.organization?.name || '-'}</Td><Td>{row.order?.orderNo || '-'}</Td><Td>{money(row.amount)}</Td><Td>{new Date(row.createdAt).toLocaleDateString()}</Td><Td><StatusBadge status={row.status} label={statusLabel(t, row.status)} /></Td></tr>)}</tbody></table>
}

function Th({ children }: { children: React.ReactNode }) { return <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-[var(--glass-text-secondary)]">{children}</th> }
function Td({ children }: { children: React.ReactNode }) { return <td className="px-6 py-4 text-sm text-[var(--glass-text-secondary)]">{children}</td> }
function StatusBadge({ status, label }: { status: string; label: string }) {
  const tone = ['active', 'paid', 'issued'].includes(status) ? 'bg-[var(--glass-tone-success-bg)] text-[var(--glass-tone-success-fg)]' : ['inactive', 'canceled', 'voided', 'expired', 'refunded', 'failed'].includes(status) ? 'bg-[var(--glass-tone-danger-bg)] text-[var(--glass-tone-danger-fg)]' : 'bg-[var(--glass-tone-warning-bg)] text-[var(--glass-tone-warning-fg)]'
  return <span className={`inline-flex rounded-full px-2 py-1 text-xs ${tone}`}>{label}</span>
}
