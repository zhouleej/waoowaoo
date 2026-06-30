'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { useSession } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import { useParams } from 'next/navigation'
import { useRouter } from '@/i18n/navigation'
import Navbar from '@/components/Navbar'
import { AppIcon } from '@/components/ui/icons'
import { Link } from '@/i18n/navigation'
import { apiFetch } from '@/lib/api-fetch'

interface OrgBalance { id: string; balance: number; frozenAmount: number; totalSpent: number }
interface Member { user: { id: string; name: string; email: string; image: string | null }; role: string; status: string; quota: number; joinedAt: string }
interface Organization { id: string; name: string; slug: string; createdAt: string; currentUserRole: string; balance: OrgBalance; members: Member[] }
interface UsageRecord { id: string; amount: number; type: string; description: string; createdAt: string }

export default function OrganizationDetailPage() {
  const params = useParams()
  const orgId = params?.id as string
  const { data: session, status } = useSession()
  const router = useRouter()
  const t = useTranslations('organizations')
  const tc = useTranslations('common')
  const [org, setOrg] = useState<Organization | null>(null)
  const [, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'members' | 'billing'>('overview')

  // 成员管理状态
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member')
  const [inviting, setInviting] = useState(false)
  const [removingUserId, setRemovingUserId] = useState<string | null>(null)
  const [showRemoveConfirm, setShowRemoveConfirm] = useState<Member | null>(null)
  const [updatingRoleUserId, setUpdatingRoleUserId] = useState<string | null>(null)

  // 编辑组织名称状态
  const [editingName, setEditingName] = useState(false)
  const [orgNameInput, setOrgNameInput] = useState('')
  const [savingName, setSavingName] = useState(false)

  // 删除组织状态
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteConfirmName, setDeleteConfirmName] = useState('')
  const [deleting, setDeleting] = useState(false)

  // 计费状态
  const [rechargeAmount, setRechargeAmount] = useState('')
  const [recharging, setRecharging] = useState(false)
  const [usageRecords, setUsageRecords] = useState<UsageRecord[]>([])
  const [loadingUsage, setLoadingUsage] = useState(false)

  const currentUserId = session?.user?.id
  const isOwner = org?.currentUserRole === 'owner'
  const isAdmin = org?.currentUserRole === 'admin'
  const canManageMembers = isOwner || isAdmin

  useEffect(() => {
    if (status === 'loading') return
    if (!session) router.push({ pathname: '/auth/signin' })
  }, [session, status, router])

  const fetchOrg = useCallback(async () => {
    if (!orgId) return
    try {
      const res = await apiFetch('/api/organizations/' + orgId)
      if (res.ok) setOrg(await res.json())
    } catch {}
    finally { setLoading(false) }
  }, [orgId])

  const fetchUsage = useCallback(async () => {
    if (!orgId) return
    setLoadingUsage(true)
    try {
      const res = await apiFetch('/api/organizations/' + orgId + '/usage')
      if (res.ok) {
        const data = await res.json()
        setUsageRecords(data.recentUsage || [])
      }
    } catch {}
    finally { setLoadingUsage(false) }
  }, [orgId])

  useEffect(() => { if (session && orgId) void fetchOrg() }, [session, orgId, fetchOrg])
  useEffect(() => { if (activeTab === 'billing' && orgId) void fetchUsage() }, [activeTab, orgId, fetchUsage])

  const formatDate = (d: string) => new Date(new Date(d).getTime() + 8 * 60 * 60 * 1000).toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' })
  const formatDateTime = (d: string) => new Date(new Date(d).getTime() + 8 * 60 * 60 * 1000).toLocaleString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

  // 邀请成员
  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inviteEmail.trim()) return
    setInviting(true)
    try {
      const res = await apiFetch('/api/organizations/' + orgId + '/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      })
      if (res.ok) {
        setShowInviteModal(false)
        setInviteEmail('')
        setInviteRole('member')
        void fetchOrg()
      }
    } catch {}
    finally { setInviting(false) }
  }

  // 修改成员角色
  const handleRoleChange = async (userId: string, newRole: string) => {
    if (userId === currentUserId) return
    setUpdatingRoleUserId(userId)
    try {
      const res = await apiFetch('/api/organizations/' + orgId + '/members/' + userId, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      })
      if (res.ok) void fetchOrg()
    } catch {}
    finally { setUpdatingRoleUserId(null) }
  }

  // 移除成员
  const handleRemoveMember = async () => {
    if (!showRemoveConfirm) return
    setRemovingUserId(showRemoveConfirm.user.id)
    try {
      const res = await apiFetch('/api/organizations/' + orgId + '/members/' + showRemoveConfirm.user.id, {
        method: 'DELETE',
      })
      if (res.ok) {
        setShowRemoveConfirm(null)
        void fetchOrg()
      }
    } catch {}
    finally { setRemovingUserId(null) }
  }

  // 编辑组织名称
  const handleSaveName = async () => {
    if (!orgNameInput.trim() || orgNameInput === org?.name) { setEditingName(false); return }
    setSavingName(true)
    try {
      const res = await apiFetch('/api/organizations/' + orgId, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: orgNameInput }),
      })
      if (res.ok) {
        setEditingName(false)
        void fetchOrg()
      }
    } catch {}
    finally { setSavingName(false) }
  }

  // 删除组织
  const handleDeleteOrg = async () => {
    if (deleteConfirmName !== org?.name) return
    setDeleting(true)
    try {
      const res = await apiFetch('/api/organizations/' + orgId, { method: 'DELETE' })
      if (res.ok) router.push({ pathname: '/admin/organizations' })
    } catch {}
    finally { setDeleting(false) }
  }

  // 充值
  const handleRecharge = async () => {
    const amount = parseFloat(rechargeAmount)
    if (!amount || amount <= 0) return
    setRecharging(true)
    try {
      const res = await apiFetch('/api/organizations/' + orgId + '/balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount }),
      })
      if (res.ok) {
        setRechargeAmount('')
        void fetchOrg()
      }
    } catch {}
    finally { setRecharging(false) }
  }

  // 角色标签样式
  const roleBadgeClass = (role: string) => {
    if (role === 'owner') return 'bg-amber-500/20 text-amber-500'
    if (role === 'admin') return 'bg-blue-500/20 text-blue-500'
    return 'bg-gray-500/20 text-gray-500'
  }

  if (status === 'loading' || !session) return <div className="glass-page min-h-screen flex items-center justify-center"><div className="text-[var(--glass-text-secondary)]">{tc('loading')}</div></div>
  if (!org) return <div className="glass-page min-h-screen flex items-center justify-center"><div className="text-[var(--glass-text-secondary)]">{tc('loading')}</div></div>

  return (
    <div className="glass-page min-h-screen">
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-6">
          <Link href={{ pathname: '/admin/organizations' }} className="text-sm text-[var(--glass-tone-info-fg)] hover:underline flex items-center gap-1">
            <AppIcon name="chevronLeft" className="w-4 h-4" />{tc('back')}
          </Link>
        </div>
        <div className="mb-8">
          {editingName ? (
            <div className="flex items-center gap-3 mb-2">
              <input
                type="text"
                value={orgNameInput}
                onChange={e => setOrgNameInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') void handleSaveName(); if (e.key === 'Escape') setEditingName(false) }}
                className="glass-input-base px-3 py-2 text-2xl font-bold flex-1"
                autoFocus
              />
              <button onClick={() => void handleSaveName()} disabled={savingName} className="glass-btn-base glass-btn-primary px-3 py-2 text-sm">{savingName ? t('saving') : t('save')}</button>
              <button onClick={() => setEditingName(false)} className="glass-btn-base glass-btn-secondary px-3 py-2 text-sm">{tc('cancel')}</button>
            </div>
          ) : (
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold text-[var(--glass-text-primary)]">{org.name}</h1>
              {isOwner && (
                <button onClick={() => { setOrgNameInput(org.name); setEditingName(true) }} className="text-[var(--glass-text-tertiary)] hover:text-[var(--glass-text-secondary)] transition-colors" title={t('editOrganization')}>
                  <AppIcon name="edit" className="w-5 h-5" />
                </button>
              )}
            </div>
          )}
          <p className="text-[var(--glass-text-secondary)] font-mono">{org.slug}</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 p-1 rounded-lg bg-[var(--glass-bg-muted)] w-fit">
          {(['overview', 'members', 'billing'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} className={'px-4 py-2 rounded-md text-sm font-medium transition-all ' + (activeTab === tab ? 'bg-[var(--glass-bg-surface)] text-[var(--glass-text-primary)] shadow-sm' : 'text-[var(--glass-text-secondary)] hover:text-[var(--glass-text-primary)]')}>
              {t(tab)}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="glass-surface p-6">
                <div className="flex items-center gap-2 mb-2"><AppIcon name="coins" className="w-5 h-5 text-[var(--glass-tone-success-fg)]" /><span className="text-sm text-[var(--glass-text-secondary)]">{t('balance')}</span></div>
                <p className="text-2xl font-bold text-[var(--glass-text-primary)]">¥{org.balance?.balance?.toFixed(2) || '0.00'}</p>
              </div>
              <div className="glass-surface p-6">
                <div className="flex items-center gap-2 mb-2"><AppIcon name="usersRound" className="w-5 h-5 text-[var(--glass-tone-info-fg)]" /><span className="text-sm text-[var(--glass-text-secondary)]">{t('members')}</span></div>
                <p className="text-2xl font-bold text-[var(--glass-text-primary)]">{org.members?.length || 0}</p>
              </div>
              <div className="glass-surface p-6">
                <div className="flex items-center gap-2 mb-2"><AppIcon name="clock" className="w-5 h-5 text-[var(--glass-text-tertiary)]" /><span className="text-sm text-[var(--glass-text-secondary)]">{t('createdAt')}</span></div>
                <p className="text-lg font-medium text-[var(--glass-text-primary)]">{formatDate(org.createdAt)}</p>
              </div>
            </div>
            {isOwner && (
              <div className="glass-surface p-6 border-t-2 border-[var(--glass-tone-danger-fg)]/20">
                <h3 className="text-lg font-semibold text-[var(--glass-tone-danger-fg)] mb-2">{t('deleteOrganization')}</h3>
                <p className="text-sm text-[var(--glass-text-secondary)] mb-4">{t('deleteOrganizationConfirm', { name: org.name })}</p>
                <button onClick={() => setShowDeleteModal(true)} className="glass-btn-base px-4 py-2 bg-[var(--glass-tone-danger-bg)] text-[var(--glass-tone-danger-fg)] border border-[var(--glass-tone-danger-fg)]/30 hover:bg-[var(--glass-tone-danger-fg)]/20 transition-colors">
                  <AppIcon name="trash" className="w-4 h-4 inline mr-2" />{t('deleteOrganization')}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Members Tab */}
        {activeTab === 'members' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-[var(--glass-text-primary)]">{t('members')} ({org.members?.length || 0})</h2>
              {canManageMembers && (
                <button onClick={() => setShowInviteModal(true)} className="glass-btn-base glass-btn-primary px-4 py-2 flex items-center gap-2">
                  <AppIcon name="plus" className="w-4 h-4" />{t('inviteMember')}
                </button>
              )}
            </div>
            {org.members && org.members.length > 0 ? (
              <div className="glass-surface overflow-hidden">
                <table className="w-full">
                  <thead className="bg-[var(--glass-bg-muted)]">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium text-[var(--glass-text-secondary)]">{t('memberName')}</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-[var(--glass-text-secondary)]">{t('role')}</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-[var(--glass-text-secondary)]">{t('status')}</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-[var(--glass-text-secondary)]">{t('quota')}</th>
                      {canManageMembers && <th className="px-4 py-3 text-right text-sm font-medium text-[var(--glass-text-secondary)]">{tc('edit')}</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--glass-stroke-base)]">
                    {org.members.map(m => (
                      <tr key={m.user.id} className="hover:bg-[var(--glass-bg-muted)]/50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {m.user.image ? (
                              <Image src={m.user.image} alt="" width={32} height={32} className="w-8 h-8 rounded-full" />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-[var(--glass-bg-muted)] flex items-center justify-center">
                                <AppIcon name="user" className="w-4 h-4 text-[var(--glass-text-tertiary)]" />
                              </div>
                            )}
                            <div>
                              <p className="text-sm font-medium text-[var(--glass-text-primary)]">{m.user.name || m.user.email}</p>
                              <p className="text-xs text-[var(--glass-text-tertiary)]">{m.user.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {isOwner && m.role !== 'owner' && m.user.id !== currentUserId ? (
                            <select
                              value={m.role}
                              onChange={e => void handleRoleChange(m.user.id, e.target.value)}
                              disabled={updatingRoleUserId === m.user.id}
                              className="glass-input-base px-2 py-1 text-xs rounded-full cursor-pointer disabled:opacity-50"
                            >
                              <option value="admin">{t('roles.admin')}</option>
                              <option value="member">{t('roles.member')}</option>
                            </select>
                          ) : (
                            <span className={'inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ' + roleBadgeClass(m.role)}>
                              {t('roles.' + m.role)}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3"><span className={'text-sm ' + (m.status === 'active' ? 'text-[var(--glass-tone-success-fg)]' : 'text-[var(--glass-tone-danger-fg)]')}>{t('statuses.' + m.status)}</span></td>
                        <td className="px-4 py-3 text-sm text-[var(--glass-text-primary)]">¥{m.quota.toFixed(2)}</td>
                        {canManageMembers && (
                          <td className="px-4 py-3 text-right">
                            {m.role !== 'owner' && m.user.id !== currentUserId && (
                              <button
                                onClick={() => setShowRemoveConfirm(m)}
                                className="text-[var(--glass-tone-danger-fg)] hover:bg-[var(--glass-tone-danger-bg)] px-2 py-1 rounded text-sm transition-colors"
                              >
                                {t('remove')}
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-16">
                <div className="w-16 h-16 bg-[var(--glass-bg-muted)] rounded-xl flex items-center justify-center mx-auto mb-4">
                  <AppIcon name="usersRound" className="w-8 h-8 text-[var(--glass-text-tertiary)]" />
                </div>
                <h3 className="text-lg font-medium text-[var(--glass-text-primary)] mb-2">{t('noMembers')}</h3>
                <p className="text-[var(--glass-text-secondary)]">{t('noMembersDesc')}</p>
              </div>
            )}
          </div>
        )}

        {/* Billing Tab */}
        {activeTab === 'billing' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="glass-surface p-6">
                <div className="flex items-center gap-2 mb-2"><AppIcon name="coins" className="w-5 h-5 text-[var(--glass-tone-success-fg)]" /><span className="text-sm text-[var(--glass-text-secondary)]">{t('balance')}</span></div>
                <p className="text-2xl font-bold text-[var(--glass-text-primary)]">¥{org.balance?.balance?.toFixed(2) || '0.00'}</p>
              </div>
              <div className="glass-surface p-6">
                <div className="flex items-center gap-2 mb-2"><AppIcon name="barChart" className="w-5 h-5 text-[var(--glass-tone-info-fg)]" /><span className="text-sm text-[var(--glass-text-secondary)]">{t('totalSpent')}</span></div>
                <p className="text-2xl font-bold text-[var(--glass-text-primary)]">¥{org.balance?.totalSpent?.toFixed(2) || '0.00'}</p>
              </div>
              <div className="glass-surface p-6">
                <div className="flex items-center gap-2 mb-2"><AppIcon name="lock" className="w-5 h-5 text-[var(--glass-tone-warning-fg)]" /><span className="text-sm text-[var(--glass-text-secondary)]">{t('frozenAmount')}</span></div>
                <p className="text-2xl font-bold text-[var(--glass-text-primary)]">¥{org.balance?.frozenAmount?.toFixed(2) || '0.00'}</p>
              </div>
            </div>

            {/* 充值区域 */}
            {canManageMembers && (
              <div className="glass-surface p-6">
                <h3 className="text-lg font-semibold text-[var(--glass-text-primary)] mb-4">{t('recharge')}</h3>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    value={rechargeAmount}
                    onChange={e => setRechargeAmount(e.target.value)}
                    placeholder={t('rechargeAmount')}
                    min="0.01"
                    step="0.01"
                    className="glass-input-base px-3 py-2 w-48"
                  />
                  <button onClick={() => void handleRecharge()} disabled={recharging || !rechargeAmount} className="glass-btn-base glass-btn-primary px-4 py-2 disabled:opacity-50">
                    {recharging ? t('saving') : t('recharge')}
                  </button>
                </div>
                <div className="flex gap-2 mt-3">
                  {['100', '500', '1000', '2000', '5000'].map(v => (
                    <button key={v} onClick={() => setRechargeAmount(v)} className="glass-btn-base glass-btn-secondary px-3 py-1 text-sm">¥{t('rechargeOptions.' + v)}</button>
                  ))}
                </div>
              </div>
            )}

            {/* 消费明细 */}
            <div className="glass-surface overflow-hidden">
              <div className="px-6 py-4 border-b border-[var(--glass-stroke-base)]">
                <h3 className="text-lg font-semibold text-[var(--glass-text-primary)]">{t('consumption')}</h3>
              </div>
              {loadingUsage ? (
                <div className="p-6 text-center text-[var(--glass-text-secondary)]">{tc('loading')}</div>
              ) : usageRecords.length > 0 ? (
                <table className="w-full">
                  <thead className="bg-[var(--glass-bg-muted)]">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium text-[var(--glass-text-secondary)]">{t('type')}</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-[var(--glass-text-secondary)]">{t('amount')}</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-[var(--glass-text-secondary)]">{t('time')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--glass-stroke-base)]">
                    {usageRecords.map(record => (
                      <tr key={record.id} className="hover:bg-[var(--glass-bg-muted)]/50">
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-[var(--glass-bg-muted)] text-[var(--glass-text-secondary)]">
                            {record.type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-[var(--glass-tone-danger-fg)]">-¥{Math.abs(record.amount).toFixed(2)}</td>
                        <td className="px-4 py-3 text-sm text-[var(--glass-text-secondary)]">{formatDateTime(record.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="p-6 text-center text-[var(--glass-text-secondary)]">{t('noConsumption')}</div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* 邀请成员弹窗 */}
      {showInviteModal && (
        <div className="fixed inset-0 glass-overlay flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="glass-surface-modal p-6 w-full max-w-md mx-4">
            <h2 className="text-xl font-bold text-[var(--glass-text-primary)] mb-4">{t('inviteMember')}</h2>
            <form onSubmit={handleInvite}>
              <div className="mb-4">
                <label className="block mb-2 text-sm font-medium text-[var(--glass-text-secondary)]">{t('inviteEmail')}</label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  placeholder={t('inviteEmailPlaceholder')}
                  className="glass-input-base w-full px-3 py-2"
                  required
                />
              </div>
              <div className="mb-6">
                <label className="block mb-2 text-sm font-medium text-[var(--glass-text-secondary)]">{t('inviteRole')}</label>
                <select
                  value={inviteRole}
                  onChange={e => setInviteRole(e.target.value as 'admin' | 'member')}
                  className="glass-input-base w-full px-3 py-2"
                >
                  <option value="member">{t('roles.member')}</option>
                  <option value="admin">{t('roles.admin')}</option>
                </select>
              </div>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => { setShowInviteModal(false); setInviteEmail(''); setInviteRole('member') }} className="glass-btn-base glass-btn-secondary px-4 py-2">{tc('cancel')}</button>
                <button type="submit" className="glass-btn-base glass-btn-primary px-4 py-2" disabled={inviting || !inviteEmail.trim()}>{inviting ? t('inviting') : t('invite')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 移除成员确认弹窗 */}
      {showRemoveConfirm && (
        <div className="fixed inset-0 glass-overlay flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="glass-surface-modal p-6 w-full max-w-md mx-4">
            <h2 className="text-xl font-bold text-[var(--glass-text-primary)] mb-2">{t('removeMember')}</h2>
            <p className="text-[var(--glass-text-secondary)] mb-6">{t('removeMemberConfirm', { name: showRemoveConfirm.user.name || showRemoveConfirm.user.email })}</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowRemoveConfirm(null)} className="glass-btn-base glass-btn-secondary px-4 py-2">{tc('cancel')}</button>
              <button onClick={() => void handleRemoveMember()} disabled={!!removingUserId} className="glass-btn-base px-4 py-2 bg-[var(--glass-tone-danger-bg)] text-[var(--glass-tone-danger-fg)] border border-[var(--glass-tone-danger-fg)]/30 hover:bg-[var(--glass-tone-danger-fg)]/20 transition-colors">
                {removingUserId ? t('removing') : t('remove')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 删除组织确认弹窗 */}
      {showDeleteModal && (
        <div className="fixed inset-0 glass-overlay flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="glass-surface-modal p-6 w-full max-w-md mx-4">
            <h2 className="text-xl font-bold text-[var(--glass-tone-danger-fg)] mb-2">{t('deleteOrganization')}</h2>
            <p className="text-[var(--glass-text-secondary)] mb-2">{t('deleteOrganizationConfirm', { name: org.name })}</p>
            <p className="text-sm text-[var(--glass-text-tertiary)] mb-4">{t('deleteOrganizationConfirmInput')}</p>
            <input
              type="text"
              value={deleteConfirmName}
              onChange={e => setDeleteConfirmName(e.target.value)}
              placeholder={org.name}
              className="glass-input-base w-full px-3 py-2 mb-6"
            />
            <div className="flex justify-end gap-3">
              <button onClick={() => { setShowDeleteModal(false); setDeleteConfirmName('') }} className="glass-btn-base glass-btn-secondary px-4 py-2">{tc('cancel')}</button>
              <button onClick={() => void handleDeleteOrg()} disabled={deleting || deleteConfirmName !== org.name} className="glass-btn-base px-4 py-2 bg-[var(--glass-tone-danger-bg)] text-[var(--glass-tone-danger-fg)] border border-[var(--glass-tone-danger-fg)]/30 hover:bg-[var(--glass-tone-danger-fg)]/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {deleting ? t('deleting') || tc('loading') : t('delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
