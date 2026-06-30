import { beforeEach, describe, expect, it, vi } from 'vitest'

const prismaMock = vi.hoisted(() => ({
  project: {
    findUnique: vi.fn(),
  },
  organizationMember: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
  },
  organizationSubscription: {
    findUnique: vi.fn(),
  },
  organizationUsage: {
    aggregate: vi.fn(),
  },
  organizationBalance: {
    findUnique: vi.fn(),
  },
}))

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))

const { assertOrganizationCanConsume } = await import('@/lib/saas/entitlements')

function buildMembership(overrides: Record<string, unknown> = {}) {
  const planEntitlements = [
    { key: 'taskTypes', value: ['voice_line', 'image_panel'] },
    { key: 'monthlyCredits', value: 10 },
    { key: 'allowOverage', value: true },
  ]
  return {
    id: 'member-1',
    userId: 'user-1',
    organizationId: 'org-1',
    role: 'member',
    quota: 0,
    quotaUsed: 0,
    status: 'active',
    organization: {
      id: 'org-1',
      status: 'active',
      businessStatus: 'paid',
      currentSubscriptionId: 'sub-1',
      currentPlan: {
        id: 'plan-1',
        status: 'active',
        entitlements: planEntitlements,
      },
    },
    ...overrides,
  }
}

describe('saas entitlements', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.project.findUnique.mockResolvedValue({ organizationId: 'org-1' })
    prismaMock.organizationMember.findUnique.mockResolvedValue(buildMembership())
    prismaMock.organizationSubscription.findUnique.mockResolvedValue({
      id: 'sub-1',
      status: 'active',
      currentPeriodEnd: new Date(Date.now() + 86_400_000),
    })
    prismaMock.organizationUsage.aggregate.mockResolvedValue({ _sum: { planCreditAmount: 0 } })
    prismaMock.organizationBalance.findUnique.mockResolvedValue({
      organizationId: 'org-1',
      balance: 100,
      frozenAmount: 0,
    })
  })

  it('returns null for personal projects without an organization', async () => {
    prismaMock.project.findUnique.mockResolvedValueOnce({ organizationId: null })

    const result = await assertOrganizationCanConsume('user-1', 5, 'voice_line', {
      projectId: 'project-personal',
    })

    expect(result).toBeNull()
    expect(prismaMock.organizationMember.findUnique).not.toHaveBeenCalled()
  })

  it('uses the project organization instead of any other active user organization', async () => {
    prismaMock.project.findUnique.mockResolvedValueOnce({ organizationId: 'org-2' })
    prismaMock.organizationMember.findUnique.mockResolvedValueOnce(buildMembership({
      organizationId: 'org-2',
      organization: {
        id: 'org-2',
        status: 'active',
        businessStatus: 'paid',
        currentSubscriptionId: 'sub-2',
        currentPlan: {
          id: 'plan-2',
          status: 'active',
          entitlements: [
            { key: 'taskTypes', value: ['voice_line'] },
            { key: 'monthlyCredits', value: 0 },
            { key: 'allowOverage', value: true },
          ],
        },
      },
    }))

    const result = await assertOrganizationCanConsume('user-1', 5, 'voice_line', {
      projectId: 'project-org-2',
    })

    expect(result?.organizationId).toBe('org-2')
    expect(prismaMock.organizationMember.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId_userId: { organizationId: 'org-2', userId: 'user-1' } },
    }))
    expect(prismaMock.organizationMember.findFirst).not.toHaveBeenCalled()
  })

  it('rejects users who are not members of the project organization', async () => {
    prismaMock.organizationMember.findUnique.mockResolvedValueOnce(null)

    await expect(assertOrganizationCanConsume('user-1', 5, 'voice_line', {
      projectId: 'project-org',
    })).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: '无企业成员权限',
    })
  })

  it('rejects organizations whose business status is overdue or churned', async () => {
    prismaMock.organizationMember.findUnique.mockResolvedValueOnce(buildMembership({
      organization: {
        id: 'org-1',
        status: 'active',
        businessStatus: 'overdue',
        currentSubscriptionId: 'sub-1',
        currentPlan: {
          id: 'plan-1',
          status: 'active',
          entitlements: [{ key: 'monthlyCredits', value: 10 }],
        },
      },
    }))

    await expect(assertOrganizationCanConsume('user-1', 5, 'voice_line', {
      projectId: 'project-org',
    })).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: '企业订阅状态不可用',
    })
  })

  it('rejects canceled, expired, or past-due subscriptions', async () => {
    prismaMock.organizationSubscription.findUnique.mockResolvedValueOnce({
      id: 'sub-1',
      status: 'past_due',
      currentPeriodEnd: new Date(Date.now() + 86_400_000),
    })

    await expect(assertOrganizationCanConsume('user-1', 5, 'voice_line', {
      projectId: 'project-org',
    })).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: '企业订阅状态不可用',
    })
  })

  it('rejects unsupported task types from plan entitlements', async () => {
    await expect(assertOrganizationCanConsume('user-1', 5, 'video_panel', {
      projectId: 'project-org',
    })).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: '当前套餐不支持该任务类型',
    })
  })

  it('rejects member quota overages with a quota error code', async () => {
    prismaMock.organizationMember.findUnique.mockResolvedValueOnce(buildMembership({
      quota: 3,
      quotaUsed: 2,
    }))
    prismaMock.organizationUsage.aggregate.mockResolvedValueOnce({
      _sum: { planCreditAmount: 0, balanceAmount: 0 },
    })

    await expect(assertOrganizationCanConsume('user-1', 5, 'voice_line', {
      projectId: 'project-org',
    })).rejects.toMatchObject({
      code: 'QUOTA_EXCEEDED',
      message: '成员配额不足',
    })
  })

  it('counts pending reservations against member quota and monthly plan credits', async () => {
    prismaMock.organizationMember.findUnique.mockResolvedValueOnce(buildMembership({
      quota: 20,
      quotaUsed: 0,
    }))
    prismaMock.organizationUsage.aggregate
      .mockResolvedValueOnce({ _sum: { planCreditAmount: 4, balanceAmount: 3 } })
      .mockResolvedValueOnce({ _sum: { planCreditAmount: 4 } })

    const result = await assertOrganizationCanConsume('user-1', 8, 'voice_line', {
      projectId: 'project-org',
    })

    expect(result).toEqual({
      organizationId: 'org-1',
      planCreditApplied: 6,
      balanceChargeApplied: 2,
    })
  })

  it('rejects balance overage when the plan disallows overage', async () => {
    prismaMock.organizationMember.findUnique.mockResolvedValueOnce(buildMembership({
      organization: {
        id: 'org-1',
        status: 'active',
        businessStatus: 'paid',
        currentSubscriptionId: 'sub-1',
        currentPlan: {
          id: 'plan-1',
          status: 'active',
          entitlements: [
            { key: 'taskTypes', value: ['voice_line'] },
            { key: 'monthlyCredits', value: 1 },
            { key: 'allowOverage', value: false },
          ],
        },
      },
    }))

    await expect(assertOrganizationCanConsume('user-1', 5, 'voice_line', {
      projectId: 'project-org',
    })).rejects.toMatchObject({
      code: 'QUOTA_EXCEEDED',
      message: '套餐权益不足且不允许超额',
    })
  })

  it('rejects insufficient organization balance for allowed overage', async () => {
    prismaMock.organizationBalance.findUnique.mockResolvedValueOnce({
      organizationId: 'org-1',
      balance: 2,
      frozenAmount: 0,
    })

    await expect(assertOrganizationCanConsume('user-1', 20, 'voice_line', {
      projectId: 'project-org',
    })).rejects.toMatchObject({
      code: 'INSUFFICIENT_BALANCE',
      message: '企业余额不足',
      details: expect.objectContaining({
        required: 10,
        available: 2,
      }),
    })
  })

  it('returns plan credit and balance split for valid organization consumption', async () => {
    const result = await assertOrganizationCanConsume('user-1', 12, 'voice_line', {
      projectId: 'project-org',
    })

    expect(result).toEqual({
      organizationId: 'org-1',
      planCreditApplied: 10,
      balanceChargeApplied: 2,
    })
  })
})
