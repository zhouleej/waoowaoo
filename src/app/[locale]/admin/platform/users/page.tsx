'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import Navbar from '@/components/Navbar'
import { apiFetch } from '@/lib/api-fetch'
import { AppIcon } from '@/components/ui/icons'
import ConfirmDialog from '@/components/ConfirmDialog'

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

interface UserOrganization {
  id: string
  name: string
  slug: string
  role: string
}

interface ConsumptionRecord {
  id: string
  amount: number
  description: string
  createdAt: string
}

interface UserDetail {
  id: string
  name: string
  email: string | null
  isPlatformAdmin: boolean
  isGlobalLocked: boolean
  createdAt: string
  organizations: UserOrganization[]
  consumption: ConsumptionRecord[]
}

export default function PlatformUsersPage() {
  const { data: session, status } = useSession()
  const t = useTranslations('platform')
  const tc = useTranslations('common')
  const router = useRouter()
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 10, total: 0, totalPages: 1 })

  // 用户详情弹窗
  const [selectedUser, setSelectedUser] = useState<UserDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [showDetailModal, setShowDetailModal] = useState(false)

  // 锁定/解锁确认
  const [showLockConfirm, setShowLockConfirm] = useState(false)
  const [lockTarget, setLockTarget] = useState<{ id: string; isLocked: boolean } | null>(null)

  // 管理员确认
  const [showAdminConfirm, setShowAdminConfirm] = useState(false)
  const [adminTarget, setAdminTarget] = useState<{ id: string; isAdmin: boolean } | null>(null)

  // Create user modal state
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createUserName, setCreateUserName] = useState('')
  const [createUserEmail, setCreateUserEmail] = useState('')
  const [createUserPassword, setCreateUserPassword] = useState('')
  const [creatingUser, setCreatingUser] = useState(false)

  const isPlatformAdmin = (session?.user as any)?.isPlatformAdmin

  useEffect(() => {
    if (status === 'loading') return
    if (!session) router.push('/auth/signin')
  }, [session, status, router])

  const fetchUsers = useCallback(async (page: number = 1, search: string = '') => {
    if (!isPlatformAdmin) return
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: pagination.limit.toString()
      })
      if (search.trim()) {
        params.set('search', search.trim())
      }
      const res = await apiFetch(`/api/platform/users?${params}`)
      const data = await res.json()
      setUsers(Array.isArray(data) ? data : (data?.data || []))
      if (data?.pagination) {
        setPagination(data.pagination)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [isPlatformAdmin, pagination.limit])

  useEffect(() => {
    fetchUsers(1, searchQuery)
  }, [searchQuery, fetchUsers])

  const handleSearch = () => {
    setSearchQuery(searchInput)
  }

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }

  const handlePageChange = (page: number) => {
    if (page < 1 || page > pagination.totalPages) return
    fetchUsers(page, searchQuery)
  }

  const handleRowClick = async (userId: string) => {
    setShowDetailModal(true)
    setDetailLoading(true)
    setSelectedUser(null)
    try {
      const res = await apiFetch(`/api/platform/users/${userId}`)
      if (res.ok) {
        const data = await res.json()
        setSelectedUser(data)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setDetailLoading(false)
    }
  }

  const handleLockClick = (userId: string, isLocked: boolean, e: React.MouseEvent) => {
    e.stopPropagation()
    setLockTarget({ id: userId, isLocked })
    setShowLockConfirm(true)
  }

  const handleLockConfirm = async () => {
    if (!lockTarget) return
    try {
      const res = await apiFetch(`/api/platform/users/${lockTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isGlobalLocked: !lockTarget.isLocked })
      })
      if (res.ok) {
        // 刷新列表和详情
        fetchUsers(pagination.page, searchQuery)
        if (selectedUser?.id === lockTarget.id) {
          setSelectedUser(prev => prev ? { ...prev, isGlobalLocked: !lockTarget.isLocked } : null)
        }
      }
    } catch (e) {
      console.error(e)
    }
    setShowLockConfirm(false)
    setLockTarget(null)
  }

  const handleAdminClick = (userId: string, isAdmin: boolean, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    setAdminTarget({ id: userId, isAdmin })
    setShowAdminConfirm(true)
  }

  const handleAdminConfirm = async () => {
    if (!adminTarget) return
    try {
      const res = await apiFetch(`/api/platform/users/${adminTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPlatformAdmin: !adminTarget.isAdmin })
      })
      if (res.ok) {
        fetchUsers(pagination.page, searchQuery)
        if (selectedUser?.id === adminTarget.id) {
          setSelectedUser(prev => prev ? { ...prev, isPlatformAdmin: !adminTarget.isAdmin } : null)
        }
      }
    } catch (e) {
      console.error(e)
    }
    setShowAdminConfirm(false)
    setAdminTarget(null)
  }

  const openCreateModal = () => {
    setCreateUserName('')
    setCreateUserEmail('')
    setCreateUserPassword('')
    setShowCreateModal(true)
  }

  const closeCreateModal = () => {
    setShowCreateModal(false)
    setCreateUserName('')
    setCreateUserEmail('')
    setCreateUserPassword('')
  }

  const handleCreateUser = async () => {
    if (!createUserName.trim() || !createUserPassword) {
      alert('用户名和密码为必填项')
      return
    }
    setCreatingUser(true)
    try {
      const res = await apiFetch('/api/platform/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: createUserName.trim(),
          email: createUserEmail.trim() || undefined,
          password: createUserPassword,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        throw new Error(err?.error || '创建失败')
      }
      alert('用户创建成功')
      closeCreateModal()
      fetchUsers(1, searchQuery)
    } catch (e: any) {
      console.error(e)
      alert(e?.message || '创建失败')
    } finally {
      setCreatingUser(false)
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
          <h1 className="text-3xl font-bold text-[var(--glass-text-primary)]">{t('users') || 'Users'}</h1>
          <div className="flex items-center gap-3">
            <button onClick={openCreateModal} className="glass-btn-base glass-btn-primary px-4 py-2">
              新建用户
            </button>
            <a href="/admin/platform" className="glass-btn-base px-4 py-2">{t('back') || 'Back'}</a>
          </div>
        </div>

        {/* 搜索栏 */}
        <div className="flex items-center gap-3 mb-6">
          <div className="relative flex-1 max-w-md">
            <AppIcon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--glass-text-tertiary)]" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder={t('searchPlaceholder')}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[var(--glass-bg-surface)] border border-[var(--glass-stroke-base)] text-[var(--glass-text-primary)] placeholder:text-[var(--glass-text-tertiary)] focus:outline-none focus:border-[var(--glass-accent-from)] transition-colors"
            />
          </div>
          <button
            onClick={handleSearch}
            className="glass-btn-base glass-btn-primary px-5 py-2.5 flex items-center gap-2"
          >
            <AppIcon name="search" className="w-4 h-4" />
            {t('search')}
          </button>
        </div>

        <div className="glass-surface overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-[var(--glass-text-secondary)]">{t('loading') || 'Loading...'}</div>
          ) : users.length === 0 ? (
            <div className="p-8 text-center text-[var(--glass-text-secondary)]">{t('noUsers') || 'No users found'}</div>
          ) : (
            <>
              <table className="w-full">
                <thead className="bg-[var(--glass-bg-muted)]">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[var(--glass-text-secondary)] uppercase tracking-wider">{t('username') || 'Username'}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[var(--glass-text-secondary)] uppercase tracking-wider">{t('email') || 'Email'}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[var(--glass-text-secondary)] uppercase tracking-wider">{t('role') || 'Role'}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[var(--glass-text-secondary)] uppercase tracking-wider">{t('status') || 'Status'}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[var(--glass-text-secondary)] uppercase tracking-wider">{t('createdAt') || 'Created'}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[var(--glass-text-secondary)] uppercase tracking-wider">{t('actions') || 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--glass-stroke-base)]">
                  {users.map((user) => (
                    <tr
                      key={user.id}
                      onClick={() => handleRowClick(user.id)}
                      className="hover:bg-[var(--glass-bg-muted)]/50 cursor-pointer transition-colors"
                    >
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-[var(--glass-text-primary)]">
                        {user.name}
                        {user.isPlatformAdmin && (
                          <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-[var(--glass-tone-warning-bg)] text-[var(--glass-tone-warning-fg)]">
                            Admin
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--glass-text-secondary)]">{user.email || '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--glass-text-secondary)]">
                        {user.isPlatformAdmin ? (t('platformAdmin') || 'Platform Admin') : (t('user') || 'User')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {user.isGlobalLocked ? (
                          <span className="px-2 py-1 text-xs rounded-full bg-[var(--glass-tone-danger-bg)] text-[var(--glass-tone-danger-fg)]">
                            {t('locked') || 'Locked'}
                          </span>
                        ) : (
                          <span className="px-2 py-1 text-xs rounded-full bg-[var(--glass-tone-success-bg)] text-[var(--glass-tone-success-fg)]">
                            {t('normal') || 'Normal'}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--glass-text-secondary)]">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <div className="flex items-center gap-2">
                          {/* 锁定/解锁按钮 */}
                          <button
                            onClick={(e) => handleLockClick(user.id, user.isGlobalLocked, e)}
                            className={`glass-btn-base px-3 py-1.5 text-xs rounded-lg flex items-center gap-1 ${
                              user.isGlobalLocked
                                ? 'glass-btn-tone-success'
                                : 'glass-btn-tone-danger'
                            }`}
                            title={user.isGlobalLocked ? t('unlockUser') : t('lockUser')}
                          >
                            <AppIcon name={user.isGlobalLocked ? 'eye' : 'lock'} className="w-3.5 h-3.5" />
                            {user.isGlobalLocked ? t('unlockUser') : t('lockUser')}
                          </button>
                          {/* 设置/取消管理员按钮 */}
                          <button
                            onClick={(e) => handleAdminClick(user.id, user.isPlatformAdmin, e)}
                            className={`glass-btn-base px-3 py-1.5 text-xs rounded-lg flex items-center gap-1 ${
                              user.isPlatformAdmin
                                ? 'glass-btn-tone-warning'
                                : 'glass-btn-tone-info'
                            }`}
                            title={user.isPlatformAdmin ? t('removeAdmin') : t('setAdmin')}
                          >
                            <AppIcon name={user.isPlatformAdmin ? 'minus' : 'badgeCheck'} className="w-3.5 h-3.5" />
                            {user.isPlatformAdmin ? t('removeAdmin') : t('setAdmin')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* 分页 */}
              <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)]/30">
                <span className="text-sm text-[var(--glass-text-tertiary)]">
                  {t('totalUsersCount', { count: pagination.total })}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handlePageChange(pagination.page - 1)}
                    disabled={pagination.page <= 1}
                    className="glass-btn-base glass-btn-secondary px-3 py-1.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                  >
                    <AppIcon name="chevronLeft" className="w-4 h-4" />
                    {t('prevPage')}
                  </button>
                  <span className="text-sm text-[var(--glass-text-secondary)] px-3">
                    {t('pageInfo', { page: pagination.page, totalPages: pagination.totalPages })}
                  </span>
                  <button
                    onClick={() => handlePageChange(pagination.page + 1)}
                    disabled={pagination.page >= pagination.totalPages}
                    className="glass-btn-base glass-btn-secondary px-3 py-1.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                  >
                    {t('nextPage')}
                    <AppIcon name="chevronRight" className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 用户详情弹窗 */}
      {showDetailModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-6">
          <div className="glass-overlay absolute inset-0" onClick={() => setShowDetailModal(false)} />
          <div className="glass-surface-modal relative z-10 w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
            {/* 标题 */}
            <div className="flex items-center justify-between px-5 py-4 sm:px-6 border-b border-[var(--glass-stroke-base)]">
              <h2 className="text-lg font-semibold text-[var(--glass-text-primary)]">{t('userDetail')}</h2>
              <button
                onClick={() => setShowDetailModal(false)}
                className="glass-btn-base glass-btn-ghost h-9 w-9"
              >
                <AppIcon name="close" className="h-5 w-5" />
              </button>
            </div>

            {/* 内容 */}
            <div className="overflow-y-auto flex-1 px-5 py-4 sm:px-6 sm:py-5">
              {detailLoading ? (
                <div className="py-8 text-center text-[var(--glass-text-secondary)]">{t('loading')}</div>
              ) : selectedUser ? (
                <div className="space-y-6">
                  {/* 基本信息 */}
                  <div>
                    <h3 className="text-sm font-medium text-[var(--glass-text-tertiary)] uppercase tracking-wider mb-3">{t('basicInfo')}</h3>
                    <div className="glass-surface p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-[var(--glass-text-secondary)]">{t('username')}</span>
                        <span className="text-sm font-medium text-[var(--glass-text-primary)] flex items-center gap-2">
                          {selectedUser.name}
                          {selectedUser.isPlatformAdmin && (
                            <span className="px-2 py-0.5 text-xs rounded-full bg-[var(--glass-tone-warning-bg)] text-[var(--glass-tone-warning-fg)]">
                              Admin
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-[var(--glass-text-secondary)]">{t('email')}</span>
                        <span className="text-sm text-[var(--glass-text-primary)]">{selectedUser.email || '-'}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-[var(--glass-text-secondary)]">{t('role')}</span>
                        <span className="text-sm text-[var(--glass-text-primary)]">
                          {selectedUser.isPlatformAdmin ? t('platformAdmin') : t('user')}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-[var(--glass-text-secondary)]">{t('status')}</span>
                        {selectedUser.isGlobalLocked ? (
                          <span className="px-2 py-1 text-xs rounded-full bg-[var(--glass-tone-danger-bg)] text-[var(--glass-tone-danger-fg)]">
                            {t('locked')}
                          </span>
                        ) : (
                          <span className="px-2 py-1 text-xs rounded-full bg-[var(--glass-tone-success-bg)] text-[var(--glass-tone-success-fg)]">
                            {t('normal')}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-[var(--glass-text-secondary)]">{t('createdAt')}</span>
                        <span className="text-sm text-[var(--glass-text-primary)]">
                          {new Date(selectedUser.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 操作按钮 */}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={(e) => handleLockClick(selectedUser.id, selectedUser.isGlobalLocked, e as unknown as React.MouseEvent)}
                      className={`glass-btn-base px-4 py-2 text-sm rounded-lg flex items-center gap-2 ${
                        selectedUser.isGlobalLocked
                          ? 'glass-btn-tone-success'
                          : 'glass-btn-tone-danger'
                      }`}
                    >
                      <AppIcon name={selectedUser.isGlobalLocked ? 'eye' : 'lock'} className="w-4 h-4" />
                      {selectedUser.isGlobalLocked ? t('unlockUser') : t('lockUser')}
                    </button>
                    <button
                      onClick={(e) => handleAdminClick(selectedUser.id, selectedUser.isPlatformAdmin, e as unknown as React.MouseEvent)}
                      className={`glass-btn-base px-4 py-2 text-sm rounded-lg flex items-center gap-2 ${
                        selectedUser.isPlatformAdmin
                          ? 'glass-btn-tone-warning'
                          : 'glass-btn-tone-info'
                      }`}
                    >
                      <AppIcon name={selectedUser.isPlatformAdmin ? 'minus' : 'badgeCheck'} className="w-4 h-4" />
                      {selectedUser.isPlatformAdmin ? t('removeAdmin') : t('setAdmin')}
                    </button>
                  </div>

                  {/* 所属组织 */}
                  <div>
                    <h3 className="text-sm font-medium text-[var(--glass-text-tertiary)] uppercase tracking-wider mb-3">{t('organizationInfo')}</h3>
                    <div className="glass-surface p-4">
                      {selectedUser.organizations && selectedUser.organizations.length > 0 ? (
                        <div className="space-y-2">
                          {selectedUser.organizations.map((org) => (
                            <div key={org.id} className="flex items-center justify-between py-2 border-b border-[var(--glass-stroke-base)] last:border-b-0">
                              <div>
                                <span className="text-sm font-medium text-[var(--glass-text-primary)]">{org.name}</span>
                                <span className="ml-2 text-xs text-[var(--glass-text-tertiary)] font-mono">{org.slug}</span>
                              </div>
                              <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--glass-tone-info-bg)] text-[var(--glass-tone-info-fg)]">
                                {org.role}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-[var(--glass-text-tertiary)] text-center py-4">{t('noOrganization')}</p>
                      )}
                    </div>
                  </div>

                  {/* 消费记录 */}
                  <div>
                    <h3 className="text-sm font-medium text-[var(--glass-text-tertiary)] uppercase tracking-wider mb-3">{t('consumptionRecords')}</h3>
                    <div className="glass-surface p-4">
                      {selectedUser.consumption && selectedUser.consumption.length > 0 ? (
                        <div className="space-y-2">
                          {selectedUser.consumption.map((record) => (
                            <div key={record.id} className="flex items-center justify-between py-2 border-b border-[var(--glass-stroke-base)] last:border-b-0">
                              <div>
                                <span className="text-sm text-[var(--glass-text-primary)]">{record.description}</span>
                                <span className="ml-2 text-xs text-[var(--glass-text-tertiary)]">
                                  {new Date(record.createdAt).toLocaleDateString()}
                                </span>
                              </div>
                              <span className="text-sm font-medium text-[var(--glass-tone-danger-fg)]">
                                -¥{typeof record.amount === 'number' ? record.amount.toFixed(2) : record.amount}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-[var(--glass-text-tertiary)] text-center py-4">{t('noConsumption')}</p>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-8 text-center text-[var(--glass-text-secondary)]">{t('noData')}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create User Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-6">
          <div className="glass-overlay absolute inset-0" onClick={closeCreateModal} />
          <div className="glass-surface-modal relative z-10 w-full max-w-md overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 sm:px-6 border-b border-[var(--glass-stroke-base)]">
              <h2 className="text-lg font-semibold text-[var(--glass-text-primary)]">新建用户</h2>
              <button onClick={closeCreateModal} className="text-[var(--glass-text-secondary)] hover:text-[var(--glass-text-primary)] text-2xl leading-none">&times;</button>
            </div>
            <div className="px-5 py-4 sm:px-6 space-y-4">
              <div>
                <label className="block text-sm text-[var(--glass-text-secondary)] mb-1">用户名 *</label>
                <input
                  type="text"
                  value={createUserName}
                  onChange={(e) => setCreateUserName(e.target.value)}
                  placeholder="请输入用户名"
                  className="glass-input-base w-full px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm text-[var(--glass-text-secondary)] mb-1">邮箱（可选）</label>
                <input
                  type="email"
                  value={createUserEmail}
                  onChange={(e) => setCreateUserEmail(e.target.value)}
                  placeholder="请输入邮箱"
                  className="glass-input-base w-full px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm text-[var(--glass-text-secondary)] mb-1">密码 *</label>
                <input
                  type="password"
                  value={createUserPassword}
                  onChange={(e) => setCreateUserPassword(e.target.value)}
                  placeholder="请输入密码"
                  className="glass-input-base w-full px-3 py-2"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-5 py-4 sm:px-6 border-t border-[var(--glass-stroke-base)]">
              <button onClick={closeCreateModal} className="glass-btn-base px-4 py-2">取消</button>
              <button
                onClick={handleCreateUser}
                disabled={creatingUser}
                className="glass-btn-base glass-btn-primary px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creatingUser ? '创建中...' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 锁定/解锁确认弹窗 */}
      <ConfirmDialog
        show={showLockConfirm}
        title={lockTarget?.isLocked ? t('unlockUser') : t('lockUser')}
        message={lockTarget?.isLocked ? t('confirmUnlock') : t('confirmLock')}
        type={lockTarget?.isLocked ? 'info' : 'danger'}
        confirmText={lockTarget?.isLocked ? t('unlockUser') : t('lockUser')}
        cancelText={tc('cancel')}
        onConfirm={handleLockConfirm}
        onCancel={() => { setShowLockConfirm(false); setLockTarget(null) }}
      />

      {/* 管理员确认弹窗 */}
      <ConfirmDialog
        show={showAdminConfirm}
        title={adminTarget?.isAdmin ? t('removeAdmin') : t('setAdmin')}
        message={adminTarget?.isAdmin ? t('confirmRemoveAdmin') : t('confirmSetAdmin')}
        type="warning"
        confirmText={adminTarget?.isAdmin ? t('removeAdmin') : t('setAdmin')}
        cancelText={tc('cancel')}
        onConfirm={handleAdminConfirm}
        onCancel={() => { setShowAdminConfirm(false); setAdminTarget(null) }}
      />
    </div>
  )
}
