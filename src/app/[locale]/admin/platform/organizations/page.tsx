'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState, useCallback, type ReactNode } from 'react'
import { useSession } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import { Link, useRouter } from '@/i18n/navigation'
import Navbar from '@/components/Navbar'
import { apiFetch } from '@/lib/api-fetch'
import ConfirmDialog from '@/components/ConfirmDialog'
import { useToast } from '@/contexts/ToastContext'

interface Organization {
  id: string
  name: string
  slug: string
  status: string
  createdAt: string
  updatedAt: string
  owner: { id: string; name: string | null; email: string }
  balance: { balance: number; frozenAmount: number; totalSpent: number } | null
  currentPlan?: { name: string; code: string; price?: number; billingCycle?: string } | null
  currentSubscription?: { status: string; currentPeriodEnd?: string | null; plan?: { name: string } | null } | null
  businessStatus?: string | null
  memberCount: number
}

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

interface Member {
  id: string
  organizationId: string
  userId: string
  role: string
  quota: number
  status: string
  joinedAt: string
  user: { id: string; name: string | null; email: string; image: string | null }
}

export default function PlatformOrganizationsPage() {
  const { data: session, status } = useSession()
  const t = useTranslations('platform')
  const router = useRouter()
  const { showToast } = useToast()
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 10, total: 0, totalPages: 0 })

  // Detail modal state
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [detailBalance, setDetailBalance] = useState<{ balance: number; frozenAmount: number; totalSpent: number } | null>(null)
  const [activeDetailTab, setActiveDetailTab] = useState<'overview' | 'members' | 'subscription' | 'orders' | 'audit'>('overview')

  // Recharge state
  const [rechargeAmount, setRechargeAmount] = useState('')
  const [recharging, setRecharging] = useState(false)

  // Create modal state
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createSlug, setCreateSlug] = useState('')
  const [creating, setCreating] = useState(false)

  // Delete state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteConfirmName, setDeleteConfirmName] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [confirmAction, setConfirmAction] = useState<{ title: string; message: string; onConfirm: () => void; type?: 'danger' | 'warning' | 'info' } | null>(null)

  const isPlatformAdmin = (session?.user as any)?.isPlatformAdmin

  useEffect(() => {
    if (status === 'loading') return
    if (!session) router.push({ pathname: '/auth/signin' })
  }, [session, status, router])

  const fetchOrganizations = useCallback(async (page: number = 1) => {
    if (!isPlatformAdmin) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: '10' })
      if (search) params.set('search', search)
      if (statusFilter) params.set('status', statusFilter)
      const res = await apiFetch(`/api/platform/organizations?${params.toString()}`)
      const data = await res.json()
      setOrganizations(Array.isArray(data) ? data : (data?.data || []))
      if (data?.pagination) {
        setPagination(data.pagination)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [isPlatformAdmin, search, statusFilter])

  useEffect(() => {
    fetchOrganizations(1)
  }, [fetchOrganizations])

  const handleSearch = () => {
    fetchOrganizations(1)
  }

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch()
  }

  const handlePageChange = (newPage: number) => {
    fetchOrganizations(newPage)
  }

  const handleDisable = async (orgId: string) => {
    setConfirmAction({ title: t('disable'), message: t('confirmDisable'), type: 'warning', onConfirm: async () => {
    setConfirmAction(null)
    try {
      await apiFetch(`/api/platform/organizations/${orgId}/disable`, { method: 'POST' })
      setOrganizations(orgs => orgs.map(o => o.id === orgId ? { ...o, status: 'disabled' } : o))
      if (selectedOrg?.id === orgId) setSelectedOrg(prev => prev ? { ...prev, status: 'disabled' } : prev)
      showToast(t('operationSuccess'), 'success')
    } catch (e) {
      console.error(e)
      showToast(t('disableFailed'), 'error')
    }
    } })
  }

  const handleEnable = async (orgId: string) => {
    try {
      await apiFetch(`/api/platform/organizations/${orgId}/enable`, { method: 'POST' })
      setOrganizations(orgs => orgs.map(o => o.id === orgId ? { ...o, status: 'active' } : o))
      if (selectedOrg?.id === orgId) setSelectedOrg(prev => prev ? { ...prev, status: 'active' } : prev)
      showToast(t('operationSuccess'), 'success')
    } catch (e) {
      console.error(e)
      showToast(t('enableFailed'), 'error')
    }
  }

  const openDetail = async (org: Organization) => {
    setSelectedOrg(org)
    setMembersLoading(true)
    setMembers([])
    setDetailBalance(org.balance)
    setActiveDetailTab('overview')
    setRechargeAmount('')
    try {
      const membersRes = await apiFetch(`/api/organizations/${org.id}/members`)
      if (membersRes.ok) {
        const membersData = await membersRes.json()
        setMembers(Array.isArray(membersData) ? membersData : [])
      }
    } catch (e) {
      console.error(e)
    } finally {
      setMembersLoading(false)
    }
  }

  const closeDetail = () => {
    setSelectedOrg(null)
    setMembers([])
    setDetailBalance(null)
    setRechargeAmount('')
  }

  const handleRecharge = async () => {
    if (!selectedOrg || !rechargeAmount) return
    const amount = parseFloat(rechargeAmount)
    if (isNaN(amount) || amount <= 0) {
      showToast(t('invalidAmount'), 'warning')
      return
    }
    setRecharging(true)
    try {
      const res = await apiFetch(`/api/platform/organizations/${selectedOrg.id}/balance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        throw new Error(err?.error || '充值失败')
      }
      const data = await res.json()
      const newBalance = data.balance?.current ?? data.balance?.balance ?? 0
      setDetailBalance(prev => prev ? { ...prev, balance: newBalance } : null)
      setOrganizations(orgs => orgs.map(o => o.id === selectedOrg.id ? { ...o, balance: { ...o.balance, balance: newBalance } as Organization['balance'] } : o))
      setRechargeAmount('')
      showToast(t('rechargeSuccess'), 'success')
    } catch (e: any) {
      console.error(e)
      showToast(e?.message || t('saveFailed'), 'error')
    } finally {
      setRecharging(false)
    }
  }

  const openCreateModal = () => {
    setCreateName('')
    setCreateSlug('')
    setShowCreateModal(true)
  }

  const closeCreateModal = () => {
    setShowCreateModal(false)
    setCreateName('')
    setCreateSlug('')
  }

  const handleCreate = async () => {
    if (!createName.trim() || !createSlug.trim()) {
      showToast(t('organizationRequired'), 'warning')
      return
    }
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(createSlug)) {
      showToast(t('invalidSlug'), 'warning')
      return
    }
    setCreating(true)
    try {
      const res = await apiFetch('/api/platform/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: createName.trim(), slug: createSlug.trim() }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        throw new Error(err?.error || t('createFailed'))
      }
      showToast(t('createSuccess'), 'success')
      closeCreateModal()
      fetchOrganizations(1)
    } catch (e: any) {
      console.error(e)
      showToast(e?.message || t('createFailed'), 'error')
    } finally {
      setCreating(false)
    }
  }

  const openDeleteConfirm = () => {
    setDeleteConfirmName('')
    setShowDeleteConfirm(true)
  }

  const closeDeleteConfirm = () => {
    setShowDeleteConfirm(false)
    setDeleteConfirmName('')
  }

  const handleDelete = async () => {
    if (!selectedOrg) return
    if (deleteConfirmName !== selectedOrg.name) {
      showToast(t('deleteNameMismatch'), 'warning')
      return
    }
    setDeleting(true)
    try {
      const res = await apiFetch(`/api/platform/organizations/${selectedOrg.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        throw new Error(err?.error || t('deleteFailed'))
      }
      showToast(t('deleteSuccess'), 'success')
      closeDeleteConfirm()
      closeDetail()
      fetchOrganizations(1)
    } catch (e: any) {
      console.error(e)
      showToast(e?.message || t('deleteFailed'), 'error')
    } finally {
      setDeleting(false)
    }
  }

  if (status === 'loading' || !session) {
    return (
      <div className="min-h-screen bg-[var(--glass-bg-root)]">
        <Navbar />
        <div className="flex items-center justify-center h-[calc(100vh-64px)]">
          <div className="animate-pulse text-[var(--glass-text-secondary)]">{t('loading') || 'Loading...'}</div>
        </div>
      </div>
    )
  }

  if (!isPlatformAdmin) {
    return (
      <div className="min-h-screen bg-[var(--glass-bg-root)]">
        <Navbar />
        <div className="flex flex-col items-center justify-center h-[calc(100vh-64px)]">
          <h1 className="text-2xl font-bold text-[var(--glass-text-primary)] mb-4">403 - Access Denied</h1>
          <p className="text-[var(--glass-text-secondary)]">You do not have permission to access this page.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--glass-bg-root)]">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-[var(--glass-text-primary)]">{t('organizations') || 'Organizations'}</h1>
          <div className="flex items-center gap-3">
            <button onClick={openCreateModal} className="glass-btn-base glass-btn-primary px-4 py-2">
              {t('newOrganization')}
            </button>
            <Link href={{ pathname: '/admin/platform' }} className="glass-btn-base px-4 py-2">{t('back') || 'Back'}</Link>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="glass-surface p-4 mb-6">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex-1 min-w-[200px]">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder={t('searchPlaceholder') || '搜索组织名称或Slug...'}
                className="glass-input-base w-full px-3 py-2"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="glass-input-base px-3 py-2"
            >
              <option value="">{t('allStatus') || '全部状态'}</option>
              <option value="active">{t('active') || '正常'}</option>
              <option value="disabled">{t('disabled') || '已禁用'}</option>
            </select>
            <button onClick={handleSearch} className="glass-btn-base glass-btn-primary px-4 py-2">
              {t('search') || '搜索'}
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="glass-surface overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-[var(--glass-text-secondary)]">{t('loading') || 'Loading...'}</div>
          ) : organizations.length === 0 ? (
            <div className="p-8 text-center text-[var(--glass-text-secondary)]">{t('noOrganizations') || 'No organizations found'}</div>
          ) : (
            <table className="w-full">
              <thead className="bg-[var(--glass-bg-muted)]">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[var(--glass-text-secondary)] uppercase tracking-wider">{t('name') || 'Name'}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[var(--glass-text-secondary)] uppercase tracking-wider">Slug</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[var(--glass-text-secondary)] uppercase tracking-wider">{t('status') || 'Status'}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[var(--glass-text-secondary)] uppercase tracking-wider">{t('members') || 'Members'}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[var(--glass-text-secondary)] uppercase tracking-wider">{t('planSummary')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[var(--glass-text-secondary)] uppercase tracking-wider">{t('balance') || 'Balance'}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[var(--glass-text-secondary)] uppercase tracking-wider">{t('createdAt') || 'Created'}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[var(--glass-text-secondary)] uppercase tracking-wider">{t('actions') || 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--glass-stroke-base)]">
                {organizations.map((org) => (
                  <tr
                    key={org.id}
                    className="hover:bg-[var(--glass-bg-muted)]/50 cursor-pointer"
                    onClick={() => openDetail(org)}
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-[var(--glass-text-primary)]">{org.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--glass-text-secondary)]">{org.slug}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        org.status === 'active'
                          ? 'bg-[var(--glass-tone-success-bg)] text-[var(--glass-tone-success-fg)]'
                          : 'bg-[var(--glass-tone-danger-bg)] text-[var(--glass-tone-danger-fg)]'
                      }`}>
                        {org.status === 'active' ? (t('active') || 'Active') : (t('disabled') || 'Disabled')}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--glass-text-secondary)]">{org.memberCount || 0}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--glass-text-secondary)]">
                      {org.currentPlan?.name || org.currentSubscription?.plan?.name || t('freePlan')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--glass-text-secondary)]">¥{org.balance?.balance?.toFixed(2) || '0.00'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--glass-text-secondary)]">
                      {new Date(org.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      {org.status === 'active' ? (
                        <button
                          onClick={() => handleDisable(org.id)}
                          className="text-sm text-[var(--glass-tone-danger-fg)] hover:underline"
                        >
                          {t('disable') || 'Disable'}
                        </button>
                      ) : (
                        <button
                          onClick={() => handleEnable(org.id)}
                          className="text-sm text-[var(--glass-tone-success-fg)] hover:underline"
                        >
                          {t('enable') || 'Enable'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <div className="text-sm text-[var(--glass-text-secondary)]">
              {t('pageInfo') || '第'} {pagination.page} {t('pageOf') || '/'} {pagination.totalPages} {t('pageTotal') || '页'} ({t('total') || '共'} {pagination.total} {t('items') || '项'})
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handlePageChange(pagination.page - 1)}
                disabled={pagination.page <= 1}
                className="glass-btn-base px-3 py-1.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t('prevPage') || '上一页'}
              </button>
              <button
                onClick={() => handlePageChange(pagination.page + 1)}
                disabled={pagination.page >= pagination.totalPages}
                className="glass-btn-base px-3 py-1.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t('nextPage') || '下一页'}
              </button>
            </div>
          </div>
        )}

        {/* Detail Modal */}
        {selectedOrg && (
          <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/50" onClick={closeDetail}>
            <div className="glass-surface w-full max-w-4xl max-h-[85vh] overflow-y-auto mx-4 p-6" onClick={(e) => e.stopPropagation()}>
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-[var(--glass-text-primary)]">{selectedOrg.name}</h2>
                <button onClick={closeDetail} className="text-[var(--glass-text-secondary)] hover:text-[var(--glass-text-primary)] text-2xl leading-none">&times;</button>
              </div>

              <div className="mb-6 flex gap-1 overflow-x-auto rounded-xl bg-[var(--glass-bg-muted)] p-1">
                {(['overview', 'members', 'subscription', 'orders', 'audit'] as const).map((tab) => (
                  <button key={tab} onClick={() => setActiveDetailTab(tab)} className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-all ${activeDetailTab === tab ? 'bg-[var(--glass-bg-surface)] text-[var(--glass-text-primary)] shadow-sm' : 'text-[var(--glass-text-secondary)] hover:text-[var(--glass-text-primary)]'}`}>{t(`orgDetailTabs.${tab}`)}</button>
                ))}
              </div>

              {activeDetailTab === 'overview' && (<>
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <div className="text-xs text-[var(--glass-text-secondary)] mb-1">Slug</div>
                  <div className="text-sm font-mono text-[var(--glass-text-primary)]">{selectedOrg.slug}</div>
                </div>
                <div>
                  <div className="text-xs text-[var(--glass-text-secondary)] mb-1">{t('status') || '状态'}</div>
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    selectedOrg.status === 'active'
                      ? 'bg-[var(--glass-tone-success-bg)] text-[var(--glass-tone-success-fg)]'
                      : 'bg-[var(--glass-tone-danger-bg)] text-[var(--glass-tone-danger-fg)]'
                  }`}>
                    {selectedOrg.status === 'active' ? (t('active') || '正常') : (t('disabled') || '已禁用')}
                  </span>
                </div>
                <div>
                  <div className="text-xs text-[var(--glass-text-secondary)] mb-1">{t('createdAt') || '创建时间'}</div>
                  <div className="text-sm text-[var(--glass-text-primary)]">{new Date(selectedOrg.createdAt).toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-xs text-[var(--glass-text-secondary)] mb-1">{t('owner') || '拥有者'}</div>
                  <div className="text-sm text-[var(--glass-text-primary)]">{selectedOrg.owner?.name || selectedOrg.owner?.email || '-'}</div>
                </div>
              </div>

              {/* Balance Info */}
              <div className="glass-surface p-4 mb-6 bg-[var(--glass-bg-muted)]/30">
                <h3 className="text-sm font-semibold text-[var(--glass-text-primary)] mb-3">{t('balance') || '余额信息'}</h3>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-lg font-bold text-[var(--glass-tone-success-fg)]">¥{detailBalance?.balance?.toFixed(2) || '0.00'}</div>
                    <div className="text-xs text-[var(--glass-text-secondary)]">{t('currentBalance') || '当前余额'}</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-[var(--glass-text-primary)]">¥{detailBalance?.frozenAmount?.toFixed(2) || '0.00'}</div>
                    <div className="text-xs text-[var(--glass-text-secondary)]">{t('frozenAmount') || '冻结金额'}</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-[var(--glass-text-secondary)]">¥{detailBalance?.totalSpent?.toFixed(2) || '0.00'}</div>
                    <div className="text-xs text-[var(--glass-text-secondary)]">{t('totalSpent') || '累计消费'}</div>
                  </div>
                </div>
              </div>

              {/* Recharge */}
              <div className="glass-surface p-4 mb-6 bg-[var(--glass-bg-muted)]/30">
                <h3 className="text-sm font-semibold text-[var(--glass-text-primary)] mb-3">{t('recharge') || '充值'}</h3>
                <div className="flex gap-3">
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={rechargeAmount}
                    onChange={(e) => setRechargeAmount(e.target.value)}
                    placeholder={t('enterAmount') || '请输入充值金额'}
                    className="glass-input-base flex-1 px-3 py-2"
                  />
                  <button
                    onClick={handleRecharge}
                    disabled={recharging || !rechargeAmount}
                    className="glass-btn-base glass-btn-primary px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    {recharging ? (t('recharging') || '充值中...') : (t('recharge') || '充值')}
                  </button>
                </div>
              </div>
              </>)}

              {/* Members List */}
              {activeDetailTab === 'members' && <div>
                <h3 className="text-sm font-semibold text-[var(--glass-text-primary)] mb-3">{t('members') || '成员列表'}</h3>
                {membersLoading ? (
                  <div className="text-center py-4 text-[var(--glass-text-secondary)]">{t('loading') || 'Loading...'}</div>
                ) : members.length === 0 ? (
                  <div className="text-center py-4 text-[var(--glass-text-secondary)]">{t('noMembers') || '暂无成员'}</div>
                ) : (
                  <div className="overflow-hidden rounded-lg border border-[var(--glass-stroke-base)]">
                    <table className="w-full">
                      <thead className="bg-[var(--glass-bg-muted)]">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-[var(--glass-text-secondary)]">{t('name') || '名称'}</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-[var(--glass-text-secondary)]">{t('email') || '邮箱'}</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-[var(--glass-text-secondary)]">{t('role') || '角色'}</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-[var(--glass-text-secondary)]">{t('status') || '状态'}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--glass-stroke-base)]">
                        {members.map((m) => (
                          <tr key={m.id} className="hover:bg-[var(--glass-bg-muted)]/50">
                            <td className="px-4 py-2 text-sm text-[var(--glass-text-primary)]">{m.user?.name || '-'}</td>
                            <td className="px-4 py-2 text-sm text-[var(--glass-text-secondary)]">{m.user?.email || '-'}</td>
                            <td className="px-4 py-2">
                              <span className={`px-2 py-0.5 text-xs rounded-full ${
                                m.role === 'owner'
                                  ? 'bg-blue-500/20 text-blue-500'
                                  : m.role === 'admin'
                                    ? 'bg-purple-500/20 text-purple-500'
                                    : 'bg-gray-500/20 text-gray-500'
                              }`}>
                                {m.role}
                              </span>
                            </td>
                            <td className="px-4 py-2">
                              <span className={`px-2 py-0.5 text-xs rounded-full ${
                                m.status === 'active'
                                  ? 'bg-[var(--glass-tone-success-bg)] text-[var(--glass-tone-success-fg)]'
                                  : 'bg-[var(--glass-tone-danger-bg)] text-[var(--glass-tone-danger-fg)]'
                              }`}>
                                {m.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>}

              {activeDetailTab === 'subscription' && (
                <div className="space-y-4">
                  <div className="glass-surface p-5 bg-[var(--glass-bg-muted)]/30">
                    <h3 className="text-sm font-semibold text-[var(--glass-text-primary)] mb-3">{t('subscription')}</h3>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <InfoItem label={t('planName')} value={selectedOrg.currentPlan?.name || selectedOrg.currentSubscription?.plan?.name || t('freePlan')} />
                      <InfoItem label={t('subscriptionStatus')} value={selectedOrg.currentSubscription?.status || selectedOrg.businessStatus || '-'} />
                      <InfoItem label={t('periodEnd')} value={selectedOrg.currentSubscription?.currentPeriodEnd ? new Date(selectedOrg.currentSubscription.currentPeriodEnd).toLocaleDateString() : '-'} />
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="glass-surface p-4"><div className="text-lg font-bold text-[var(--glass-tone-success-fg)]">¥{detailBalance?.balance?.toFixed(2) || '0.00'}</div><div className="text-xs text-[var(--glass-text-secondary)]">{t('currentBalance')}</div></div>
                    <div className="glass-surface p-4"><div className="text-lg font-bold text-[var(--glass-text-primary)]">¥{detailBalance?.totalSpent?.toFixed(2) || '0.00'}</div><div className="text-xs text-[var(--glass-text-secondary)]">{t('totalSpent')}</div></div>
                    <div className="glass-surface p-4"><div className="text-lg font-bold text-[var(--glass-tone-warning-fg)]">{selectedOrg.memberCount || 0}</div><div className="text-xs text-[var(--glass-text-secondary)]">{t('memberUsage')}</div></div>
                  </div>
                </div>
              )}

              {activeDetailTab === 'orders' && <div className="p-8 text-center text-[var(--glass-text-secondary)]">{t('ordersLinkedHint')}</div>}
              {activeDetailTab === 'audit' && <div className="p-8 text-center text-[var(--glass-text-secondary)]">{t('auditLinkedHint')}</div>}

              {/* Delete Organization */}
              <div className="mt-6 pt-4 border-t border-[var(--glass-stroke-base)]">
                <button
                  onClick={openDeleteConfirm}
                  className="glass-btn-base glass-btn-tone-danger px-4 py-2 text-sm"
                >
                  {t('deleteOrganization')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Create Organization Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-6">
            <div className="glass-overlay absolute inset-0" onClick={closeCreateModal} />
            <div className="glass-surface-modal relative z-10 w-full max-w-md overflow-hidden flex flex-col">
              <div className="flex items-center justify-between px-5 py-4 sm:px-6 border-b border-[var(--glass-stroke-base)]">
                <h2 className="text-lg font-semibold text-[var(--glass-text-primary)]">{t('newOrganization')}</h2>
                <button onClick={closeCreateModal} className="text-[var(--glass-text-secondary)] hover:text-[var(--glass-text-primary)] text-2xl leading-none">&times;</button>
              </div>
              <div className="px-5 py-4 sm:px-6 space-y-4">
                <div>
                  <label className="block text-sm text-[var(--glass-text-secondary)] mb-1">{t('organizationName')} *</label>
                  <input
                    type="text"
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    placeholder={t('organizationNamePlaceholder')}
                    className="glass-input-base w-full px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm text-[var(--glass-text-secondary)] mb-1">{t('organizationSlug')} *</label>
                  <input
                    type="text"
                    value={createSlug}
                    onChange={(e) => setCreateSlug(e.target.value)}
                    placeholder="例如：my-org（小写字母、数字、连字符）"
                    className="glass-input-base w-full px-3 py-2"
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 px-5 py-4 sm:px-6 border-t border-[var(--glass-stroke-base)]">
                <button onClick={closeCreateModal} className="glass-btn-base px-4 py-2">{t('cancel')}</button>
                <button
                  onClick={handleCreate}
                  disabled={creating}
                  className="glass-btn-base glass-btn-primary px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {creating ? t('creating') : t('create')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Organization Confirmation Modal */}
        {showDeleteConfirm && selectedOrg && (
          <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 sm:p-6">
            <div className="glass-overlay absolute inset-0" onClick={closeDeleteConfirm} />
            <div className="glass-surface-modal relative z-10 w-full max-w-md overflow-hidden flex flex-col">
              <div className="flex items-center justify-between px-5 py-4 sm:px-6 border-b border-[var(--glass-stroke-base)]">
                <h2 className="text-lg font-semibold text-[var(--glass-tone-danger-fg)]">{t('deleteOrganization')}</h2>
                <button onClick={closeDeleteConfirm} className="text-[var(--glass-text-secondary)] hover:text-[var(--glass-text-primary)] text-2xl leading-none">&times;</button>
              </div>
              <div className="px-5 py-4 sm:px-6 space-y-4">
                <p className="text-sm text-[var(--glass-text-secondary)]">
                  {t('deleteOrganizationDanger', { name: selectedOrg.name })}
                </p>
                <div>
                  <label className="block text-sm text-[var(--glass-text-secondary)] mb-1">
                    {t('deleteOrganizationInputHint', { name: selectedOrg.name })}
                  </label>
                  <input
                    type="text"
                    value={deleteConfirmName}
                    onChange={(e) => setDeleteConfirmName(e.target.value)}
                    placeholder={selectedOrg.name}
                    className="glass-input-base w-full px-3 py-2"
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 px-5 py-4 sm:px-6 border-t border-[var(--glass-stroke-base)]">
                <button onClick={closeDeleteConfirm} className="glass-btn-base px-4 py-2">{t('cancel')}</button>
                <button
                  onClick={handleDelete}
                  disabled={deleting || deleteConfirmName !== selectedOrg.name}
                  className="glass-btn-base glass-btn-tone-danger px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {deleting ? t('deleting') : t('confirmDelete')}
                </button>
              </div>
            </div>
          </div>
        )}
        <ConfirmDialog
          show={!!confirmAction}
          title={confirmAction?.title || ''}
          message={confirmAction?.message || ''}
          type={confirmAction?.type || 'warning'}
          confirmText={t('confirm')}
          cancelText={t('cancel')}
          onConfirm={() => confirmAction?.onConfirm()}
          onCancel={() => setConfirmAction(null)}
        />
      </div>
    </div>
  )
}

function InfoItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs text-[var(--glass-text-secondary)]">{label}</div>
      <div className="text-sm font-medium text-[var(--glass-text-primary)]">{value}</div>
    </div>
  )
}
