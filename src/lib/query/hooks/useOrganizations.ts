'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../keys'
import { apiFetch } from '@/lib/api-fetch'

// ============ 类型定义 ============

export type OrganizationRole = 'owner' | 'admin' | 'member'
export type MemberStatus = 'active' | 'frozen'

export interface User {
    id: string
    name: string | null
    email: string
    image: string | null
}

export interface OrganizationMember {
    id: string
    organizationId: string
    userId: string
    role: OrganizationRole
    quota: number
    status: MemberStatus
    joinedAt: string
    user: User
}

export interface OrganizationBalance {
    id: string
    organizationId: string
    balance: number
    frozenAmount: number
    totalSpent: number
    updatedAt: string
}

export interface Organization {
    id: string
    name: string
    slug: string
    createdAt: string
    updatedAt: string
    owner: User
    currentUserRole: OrganizationRole
    currentUserStatus: MemberStatus
    balance: OrganizationBalance
    members?: OrganizationMember[]
}

export interface OrganizationDetail extends Organization {
    members: OrganizationMember[]
}

export interface OrganizationBalanceResponse {
    success: boolean
    currency: string
    organizationId: string
    organizationName: string
    balance: number
    frozenAmount: number
    totalSpent: number
}

export interface OrganizationUsageResponse {
    success: boolean
    organizationId: string
    organizationName: string
    period: {
        startDate?: string
        endDate?: string
    }
    summary: {
        totalAmount: number
        totalCount: number
        balance: number
        frozenAmount: number
    }
    usageByType: Array<{
        type: string
        totalAmount: number
        count: number
    }>
    memberUsage: Array<{
        userId: string
        userName: string
        totalAmount: number
        count: number
    }>
    recentUsage: Array<{
        id: string
        amount: number
        type: string
        description: string
        createdAt: string
    }>
}

export interface MemberUsageResponse {
    success: boolean
    organizationId: string
    organizationName: string
    member: {
        id: string
        userId: string
        userName: string
        userEmail: string
        userImage: string | null
        role: OrganizationRole
        status: MemberStatus
        joinedAt: string
    }
    period: {
        startDate?: string
        endDate?: string
    }
    quota: {
        quota: number
        used: number
        remaining: number
        period: string
        periodStart: string
        periodEnd: string
    } | null
    summary: {
        totalAmount: number
        totalCount: number
    }
    usageByType: Array<{
        type: string
        totalAmount: number
        count: number
    }>
    recentUsage: Array<{
        id: string
        amount: number
        type: string
        description: string
        createdAt: string
    }>
}

export interface CreateOrganizationInput {
    name: string
    slug: string
}

export interface UpdateOrganizationInput {
    name?: string
}

export interface InviteMemberInput {
    email: string
    role?: 'admin' | 'member'
}

export interface UpdateMemberInput {
    role?: 'admin' | 'member'
    quota?: number
    status?: 'active' | 'frozen'
}

export interface RechargeInput {
    amount: number
    paymentMethod?: string
}

// ============ Hooks ============

/**
 * 获取当前用户所属的组织列表
 */
export function useOrganizations() {
    return useQuery({
        queryKey: queryKeys.organizations.all(),
        queryFn: async () => {
            const res = await apiFetch('/api/organizations')
            if (!res.ok) {
                const error = await res.json()
                throw new Error(error.message || 'Failed to fetch organizations')
            }
            return res.json() as Promise<Organization[]>
        },
    })
}

/**
 * 获取组织详情
 */
export function useOrganization(id: string | null) {
    return useQuery({
        queryKey: queryKeys.organizations.detail(id || ''),
        queryFn: async () => {
            if (!id) throw new Error('Organization ID is required')
            const res = await apiFetch(`/api/organizations/${id}`)
            if (!res.ok) {
                const error = await res.json()
                throw new Error(error.message || 'Failed to fetch organization')
            }
            return res.json() as Promise<OrganizationDetail>
        },
        enabled: !!id,
    })
}

/**
 * 创建组织
 */
export function useCreateOrganization() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (data: CreateOrganizationInput) => {
            const res = await apiFetch('/api/organizations', {
                method: 'POST',
                body: JSON.stringify(data),
            })
            if (!res.ok) {
                const error = await res.json()
                throw new Error(error.message || 'Failed to create organization')
            }
            return res.json() as Promise<OrganizationDetail>
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.organizations.all() })
        },
    })
}

/**
 * 更新组织
 */
export function useUpdateOrganization() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ id, data }: { id: string; data: UpdateOrganizationInput }) => {
            const res = await apiFetch(`/api/organizations/${id}`, {
                method: 'PATCH',
                body: JSON.stringify(data),
            })
            if (!res.ok) {
                const error = await res.json()
                throw new Error(error.message || 'Failed to update organization')
            }
            return res.json() as Promise<OrganizationDetail>
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.organizations.all() })
            queryClient.invalidateQueries({ queryKey: queryKeys.organizations.detail(variables.id) })
        },
    })
}

/**
 * 删除组织
 */
export function useDeleteOrganization() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (id: string) => {
            const res = await apiFetch(`/api/organizations/${id}`, {
                method: 'DELETE',
            })
            if (!res.ok) {
                const error = await res.json()
                throw new Error(error.message || 'Failed to delete organization')
            }
            return res.ok
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.organizations.all() })
        },
    })
}

/**
 * 获取组织成员列表
 */
export function useOrganizationMembers(orgId: string | null) {
    return useQuery({
        queryKey: queryKeys.organizations.members(orgId || ''),
        queryFn: async () => {
            if (!orgId) throw new Error('Organization ID is required')
            const res = await apiFetch(`/api/organizations/${orgId}/members`)
            if (!res.ok) {
                const error = await res.json()
                throw new Error(error.message || 'Failed to fetch members')
            }
            return res.json() as Promise<OrganizationMember[]>
        },
        enabled: !!orgId,
    })
}

/**
 * 邀请成员
 */
export function useInviteMember() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ orgId, data }: { orgId: string; data: InviteMemberInput }) => {
            const res = await apiFetch(`/api/organizations/${orgId}/members`, {
                method: 'POST',
                body: JSON.stringify(data),
            })
            if (!res.ok) {
                const error = await res.json()
                throw new Error(error.message || 'Failed to invite member')
            }
            return res.json() as Promise<OrganizationMember>
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.organizations.members(variables.orgId) })
        },
    })
}

/**
 * 更新成员
 */
export function useUpdateMember() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ orgId, userId, data }: { orgId: string; userId: string; data: UpdateMemberInput }) => {
            const res = await apiFetch(`/api/organizations/${orgId}/members/${userId}`, {
                method: 'PATCH',
                body: JSON.stringify(data),
            })
            if (!res.ok) {
                const error = await res.json()
                throw new Error(error.message || 'Failed to update member')
            }
            return res.json() as Promise<OrganizationMember>
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.organizations.members(variables.orgId) })
        },
    })
}

/**
 * 移除成员
 */
export function useRemoveMember() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ orgId, userId }: { orgId: string; userId: string }) => {
            const res = await apiFetch(`/api/organizations/${orgId}/members/${userId}`, {
                method: 'DELETE',
            })
            if (!res.ok) {
                const error = await res.json()
                throw new Error(error.message || 'Failed to remove member')
            }
            return res.ok
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.organizations.members(variables.orgId) })
        },
    })
}

/**
 * 获取组织余额
 */
export function useOrganizationBalance(orgId: string | null) {
    return useQuery({
        queryKey: queryKeys.organizations.balance(orgId || ''),
        queryFn: async () => {
            if (!orgId) throw new Error('Organization ID is required')
            const res = await apiFetch(`/api/organizations/${orgId}/balance`)
            if (!res.ok) {
                const error = await res.json()
                throw new Error(error.message || 'Failed to fetch balance')
            }
            return res.json() as Promise<OrganizationBalanceResponse>
        },
        enabled: !!orgId,
    })
}

/**
 * 组织充值
 */
export function useRechargeOrganization() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ orgId, data }: { orgId: string; data: RechargeInput }) => {
            const res = await apiFetch(`/api/organizations/${orgId}/balance`, {
                method: 'POST',
                body: JSON.stringify(data),
            })
            if (!res.ok) {
                const error = await res.json()
                throw new Error(error.message || 'Failed to recharge')
            }
            return res.json() as Promise<OrganizationBalanceResponse>
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.organizations.balance(variables.orgId) })
        },
    })
}

/**
 * 获取组织消费统计
 */
export function useOrganizationUsage(
    orgId: string | null,
    options?: { startDate?: string; endDate?: string }
) {
    return useQuery({
        queryKey: queryKeys.organizations.usage(orgId || ''),
        queryFn: async () => {
            if (!orgId) throw new Error('Organization ID is required')
            const params = new URLSearchParams()
            if (options?.startDate) params.set('startDate', options.startDate)
            if (options?.endDate) params.set('endDate', options.endDate)
            const queryString = params.toString()
            const url = queryString
                ? `/api/organizations/${orgId}/usage?${queryString}`
                : `/api/organizations/${orgId}/usage`
            const res = await apiFetch(url)
            if (!res.ok) {
                const error = await res.json()
                throw new Error(error.message || 'Failed to fetch usage')
            }
            return res.json() as Promise<OrganizationUsageResponse>
        },
        enabled: !!orgId,
    })
}

/**
 * 获取成员消费记录
 */
export function useMemberUsage(
    orgId: string | null,
    userId: string | null,
    options?: { startDate?: string; endDate?: string }
) {
    return useQuery({
        queryKey: queryKeys.organizations.memberUsage(orgId || '', userId || ''),
        queryFn: async () => {
            if (!orgId || !userId) throw new Error('Organization ID and User ID are required')
            const params = new URLSearchParams()
            if (options?.startDate) params.set('startDate', options.startDate)
            if (options?.endDate) params.set('endDate', options.endDate)
            const queryString = params.toString()
            const url = queryString
                ? `/api/organizations/${orgId}/members/${userId}/usage?${queryString}`
                : `/api/organizations/${orgId}/members/${userId}/usage`
            const res = await apiFetch(url)
            if (!res.ok) {
                const error = await res.json()
                throw new Error(error.message || 'Failed to fetch member usage')
            }
            return res.json() as Promise<MemberUsageResponse>
        },
        enabled: !!orgId && !!userId,
    })
}