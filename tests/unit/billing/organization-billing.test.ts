import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock prisma module
const mockPrisma = {
  organizationBalance: {
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    create: vi.fn()
  },
  organizationMember: {
    findUnique: vi.fn()
  },
  organizationUsage: {
    create: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    aggregate: vi.fn().mockResolvedValue({ _sum: { amount: 0 } })
  },
  $transaction: vi.fn((callback) => callback(mockPrisma))
}

const reportingMock = vi.hoisted(() => ({
  recordUsageCostOnly: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma
}))

vi.mock('@/lib/billing/reporting', () => reportingMock)

// Import after mocking
const { 
  getOrganizationBalance, 
  addOrganizationBalance,
  freezeOrganizationBalance,
  confirmOrganizationCharge,
  confirmOrganizationChargeWithRecord,
  increaseOrganizationPendingFreezeAmount,
  rollbackOrganizationFreeze,
  checkOrganizationBalance,
  checkMemberQuota,
  recordOrganizationUsage
} = await import('@/lib/billing/organization')

describe('Organization Billing Core Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.organizationUsage.aggregate.mockResolvedValue({ _sum: { amount: 0 } })
    mockPrisma.organizationUsage.findFirst.mockResolvedValue(null)
  })

  describe('getOrganizationBalance', () => {
    it('should return organization balance', async () => {
      const mockBalance = {
        id: 'org-bal-1',
        organizationId: 'org-1',
        balance: 1000,
        frozenAmount: 0,
        totalSpent: 0
      }
      
      mockPrisma.organizationBalance.findUnique.mockResolvedValue(mockBalance)

      const result = await getOrganizationBalance('org-1')
      
      expect(result).toEqual(mockBalance)
    })

    it('should return null if organization not found', async () => {
      mockPrisma.organizationBalance.findUnique.mockResolvedValue(null)

      const result = await getOrganizationBalance('non-existent')
      
      expect(result).toBeNull()
    })
  })

  describe('addOrganizationBalance', () => {
    it('should add balance to organization', async () => {
      const mockBalance = {
        id: 'org-bal-1',
        organizationId: 'org-1',
        balance: 1000,
        frozenAmount: 0,
        totalSpent: 0
      }
      
      mockPrisma.organizationBalance.findUnique.mockResolvedValue(mockBalance)
      mockPrisma.organizationBalance.update.mockResolvedValue({
        ...mockBalance,
        balance: 2000
      })

      const result = await addOrganizationBalance('org-1', 1000)
      
      expect(result?.balance).toBe(2000)
    })

    it('should not add balance twice for the same idempotency key', async () => {
      const existingUsage = {
        id: 'usage-existing',
        organizationId: 'org-1',
        userId: 'operator-1',
        amount: 1000,
        type: 'recharge',
        orderId: null,
        idempotencyKey: 'idem-1',
        description: 'existing recharge',
        metadata: {},
        createdAt: new Date(),
      }
      const existingBalance = {
        id: 'org-bal-1',
        organizationId: 'org-1',
        balance: 1000,
        frozenAmount: 0,
        totalSpent: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      mockPrisma.organizationUsage.findFirst.mockResolvedValue(existingUsage)
      mockPrisma.organizationBalance.findUnique.mockResolvedValue(existingBalance)

      const result = await addOrganizationBalance('org-1', 1000, {
        operatorId: 'operator-1',
        idempotencyKey: 'idem-1',
      })

      expect(result.balance).toBe(1000)
      expect(mockPrisma.organizationUsage.findFirst).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          type: 'recharge',
          idempotencyKey: 'idem-1',
        },
      })
      expect(mockPrisma.organizationBalance.update).not.toHaveBeenCalled()
      expect(mockPrisma.organizationUsage.create).not.toHaveBeenCalled()
    })

    it('should return existing balance when a concurrent recharge already claimed the idempotency key', async () => {
      const existingBalance = {
        id: 'org-bal-1',
        organizationId: 'org-1',
        balance: 1000,
        frozenAmount: 0,
        totalSpent: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      const uniqueError = Object.assign(new Error('unique constraint'), { code: 'P2002' })

      mockPrisma.organizationUsage.findFirst.mockResolvedValue(null)
      mockPrisma.organizationUsage.create.mockRejectedValue(uniqueError)
      mockPrisma.organizationBalance.findUnique.mockResolvedValue(existingBalance)

      const result = await addOrganizationBalance('org-1', 1000, {
        operatorId: 'operator-1',
        idempotencyKey: 'idem-1',
      })

      expect(result.balance).toBe(1000)
      expect(mockPrisma.organizationBalance.update).not.toHaveBeenCalled()
    })
  })

  describe('organization freeze lifecycle', () => {
    it('should freeze organization balance and return a persistent freeze record id', async () => {
      const mockBalance = {
        id: 'org-bal-1',
        organizationId: 'org-1',
        balance: 1000,
        frozenAmount: 0,
        totalSpent: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      mockPrisma.organizationBalance.findUnique.mockResolvedValue(mockBalance)
      mockPrisma.organizationBalance.updateMany.mockResolvedValue({ count: 1 })
      mockPrisma.organizationUsage.create.mockResolvedValue({
        id: 'org-freeze-1',
        organizationId: 'org-1',
        userId: 'system',
        amount: 200,
        type: 'freeze',
        metadata: { status: 'pending' },
      })

      const freezeId = await freezeOrganizationBalance('org-1', 200, {
        userId: 'user-1',
        taskId: 'task-1',
        idempotencyKey: 'freeze-key-1',
        planCreditAmount: 50,
      })

      expect(freezeId).toBe('org-freeze-1')
      expect(mockPrisma.organizationUsage.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          organizationId: 'org-1',
          userId: 'user-1',
          amount: 200,
          planCreditAmount: 50,
          type: 'freeze',
          taskId: 'task-1',
          idempotencyKey: 'freeze-key-1',
        }),
      }))
    })

    it('should reuse an existing organization freeze with the same idempotency key', async () => {
      mockPrisma.organizationUsage.findFirst.mockResolvedValue({
        id: 'org-freeze-existing',
        organizationId: 'org-1',
        amount: 200,
        planCreditAmount: 0,
        taskId: 'task-1',
        type: 'freeze',
        metadata: { status: 'pending' },
        idempotencyKey: 'freeze-key-1',
      })

      const freezeId = await freezeOrganizationBalance('org-1', 200, {
        userId: 'user-1',
        taskId: 'task-1',
        idempotencyKey: 'freeze-key-1',
      })

      expect(freezeId).toBe('org-freeze-existing')
      expect(mockPrisma.organizationBalance.updateMany).not.toHaveBeenCalled()
      expect(mockPrisma.organizationUsage.create).not.toHaveBeenCalled()
    })

    it('should create a zero-balance reservation for plan-credit-only usage', async () => {
      const mockBalance = {
        id: 'org-bal-1',
        organizationId: 'org-1',
        balance: 1000,
        frozenAmount: 0,
        totalSpent: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      mockPrisma.organizationBalance.findUnique.mockResolvedValue(mockBalance)
      mockPrisma.organizationUsage.create.mockResolvedValue({
        id: 'org-reservation-1',
        organizationId: 'org-1',
        userId: 'user-1',
        amount: 0,
        planCreditAmount: 200,
        balanceAmount: 0,
        type: 'freeze',
        metadata: { status: 'pending' },
      })

      const freezeId = await freezeOrganizationBalance('org-1', 0, {
        userId: 'user-1',
        taskId: 'task-plan-credit',
        idempotencyKey: 'reservation-key-1',
        planCreditAmount: 200,
      })

      expect(freezeId).toBe('org-reservation-1')
      expect(mockPrisma.organizationBalance.updateMany).not.toHaveBeenCalled()
      expect(mockPrisma.organizationUsage.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          organizationId: 'org-1',
          userId: 'user-1',
          amount: 0,
          planCreditAmount: 200,
          balanceAmount: 0,
          type: 'freeze',
        }),
      }))
    })

    it('should expand a pending organization freeze when overage is needed', async () => {
      const usage = {
        id: 'org-freeze-1',
        organizationId: 'org-1',
        userId: 'system',
        amount: 200,
        balanceAmount: 200,
        type: 'freeze',
        metadata: { status: 'pending', freezeAmount: 200 },
      }
      mockPrisma.organizationUsage.findUnique.mockResolvedValue(usage)
      mockPrisma.organizationBalance.updateMany.mockResolvedValue({ count: 1 })
      mockPrisma.organizationUsage.updateMany.mockResolvedValue({ count: 1 })

      const result = await increaseOrganizationPendingFreezeAmount('org-freeze-1', 50)

      expect(result).toBe(true)
      expect(mockPrisma.organizationBalance.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        where: {
          organizationId: 'org-1',
          balance: { gte: 50 },
        },
        data: {
          balance: { decrement: 50 },
          frozenAmount: { increment: 50 },
        },
      }))
      expect(mockPrisma.organizationUsage.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          amount: { increment: 50 },
          balanceAmount: { increment: 50 },
        }),
      }))
    })

    it('should confirm a pending organization freeze exactly once', async () => {
      const usage = {
        id: 'org-freeze-1',
        organizationId: 'org-1',
        userId: 'system',
        amount: 200,
        type: 'freeze',
        metadata: { status: 'pending' },
      }
      mockPrisma.organizationUsage.findUnique.mockResolvedValue(usage)
      mockPrisma.organizationUsage.updateMany.mockResolvedValue({ count: 1 })
      mockPrisma.organizationBalance.updateMany.mockResolvedValue({ count: 1 })
      mockPrisma.organizationUsage.update.mockResolvedValue({ ...usage, metadata: { status: 'confirmed' } })

      const result = await confirmOrganizationCharge('org-freeze-1', 200)

      expect(result).toBe(true)
      expect(mockPrisma.organizationUsage.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        where: {
          id: 'org-freeze-1',
          type: 'freeze',
        },
      }))
      expect(mockPrisma.organizationBalance.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          frozenAmount: { gte: 200 },
        }),
        data: expect.objectContaining({
          frozenAmount: { decrement: 200 },
          totalSpent: { increment: 200 },
        }),
      }))
      expect(mockPrisma.organizationUsage.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'org-freeze-1' },
        data: expect.objectContaining({
          type: 'charge',
        }),
      }))
    })

    it('should confirm a pending organization freeze and record task usage in one transaction', async () => {
      const usage = {
        id: 'org-freeze-1',
        organizationId: 'org-1',
        userId: 'system',
        amount: 200,
        type: 'freeze',
        metadata: { status: 'pending', freezeAmount: 200 },
      }
      mockPrisma.organizationUsage.findUnique.mockResolvedValue(usage)
      mockPrisma.organizationUsage.updateMany.mockResolvedValue({ count: 1 })
      mockPrisma.organizationBalance.updateMany.mockResolvedValue({ count: 1 })
      mockPrisma.organizationUsage.update.mockResolvedValue({ ...usage, metadata: { status: 'confirmed' } })

      const result = await confirmOrganizationChargeWithRecord('org-freeze-1', 180, {
        projectId: 'project-1',
        userId: 'user-1',
        action: 'voice_line',
        apiType: 'voice',
        model: 'index-tts2',
        quantity: 5,
        unit: 'second',
        cost: 200,
        balanceAfter: 0,
        organizationId: 'org-1',
        planCreditAmount: 20,
        balanceAmount: 180,
        metadata: { taskId: 'task-1' },
      })

      expect(result).toBe(true)
      expect(reportingMock.recordUsageCostOnly).toHaveBeenCalledWith(
        mockPrisma,
        expect.objectContaining({
          projectId: 'project-1',
          userId: 'user-1',
          organizationId: 'org-1',
          cost: 200,
          balanceAmount: 180,
          metadata: expect.objectContaining({
            taskId: 'task-1',
            organizationFreezeId: 'org-freeze-1',
            organizationBalanceSettled: true,
            skipUserBalanceTransaction: true,
          }),
        }),
      )
    })

    it('should reject duplicate confirmation after another worker claimed the freeze', async () => {
      const usage = {
        id: 'org-freeze-1',
        organizationId: 'org-1',
        userId: 'system',
        amount: 200,
        type: 'freeze',
        metadata: { status: 'pending' },
      }
      mockPrisma.organizationUsage.findUnique.mockResolvedValue(usage)
      mockPrisma.organizationUsage.updateMany.mockResolvedValue({ count: 0 })

      const result = await confirmOrganizationCharge('org-freeze-1', 200)

      expect(result).toBe(false)
      expect(mockPrisma.organizationBalance.updateMany).not.toHaveBeenCalled()
      expect(mockPrisma.organizationUsage.update).not.toHaveBeenCalled()
    })

    it('should roll back a pending organization freeze', async () => {
      const usage = {
        id: 'org-freeze-1',
        organizationId: 'org-1',
        userId: 'system',
        amount: 200,
        type: 'freeze',
        metadata: { status: 'pending' },
      }
      mockPrisma.organizationUsage.findUnique.mockResolvedValue(usage)
      mockPrisma.organizationUsage.updateMany.mockResolvedValue({ count: 1 })
      mockPrisma.organizationBalance.updateMany.mockResolvedValue({ count: 1 })
      mockPrisma.organizationUsage.update.mockResolvedValue({ ...usage, metadata: { status: 'rolled_back' } })

      const result = await rollbackOrganizationFreeze('org-freeze-1')

      expect(result).toBe(true)
      expect(mockPrisma.organizationUsage.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        where: {
          id: 'org-freeze-1',
          type: 'freeze',
        },
      }))
      expect(mockPrisma.organizationBalance.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          frozenAmount: { gte: 200 },
        }),
        data: expect.objectContaining({
          balance: { increment: 200 },
          frozenAmount: { decrement: 200 },
        }),
      }))
      expect(mockPrisma.organizationUsage.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'org-freeze-1' },
      }))
    })

    it('should reject duplicate rollback after another worker claimed the freeze', async () => {
      const usage = {
        id: 'org-freeze-1',
        organizationId: 'org-1',
        userId: 'system',
        amount: 200,
        type: 'freeze',
        metadata: { status: 'pending' },
      }
      mockPrisma.organizationUsage.findUnique.mockResolvedValue(usage)
      mockPrisma.organizationUsage.updateMany.mockResolvedValue({ count: 0 })

      const result = await rollbackOrganizationFreeze('org-freeze-1')

      expect(result).toBe(false)
      expect(mockPrisma.organizationBalance.updateMany).not.toHaveBeenCalled()
      expect(mockPrisma.organizationUsage.update).not.toHaveBeenCalled()
    })
  })

  describe('checkOrganizationBalance', () => {
    it('should return true when balance is sufficient', async () => {
      mockPrisma.organizationBalance.findUnique.mockResolvedValue({
        balance: 1000,
        frozenAmount: 0
      })

      const result = await checkOrganizationBalance('org-1', 500)
      
      expect(result).toBe(true)
    })

    it('should return false when balance is insufficient', async () => {
      mockPrisma.organizationBalance.findUnique.mockResolvedValue({
        balance: 100,
        frozenAmount: 0
      })

      const result = await checkOrganizationBalance('org-1', 500)
      
      expect(result).toBe(false)
    })
  })

  describe('checkMemberQuota', () => {
    it('should return quota info when quota is sufficient', async () => {
      mockPrisma.organizationMember.findUnique.mockResolvedValue({
        quota: 1000,
        status: 'active'
      })

      const result = await checkMemberQuota('org-1', 'user-1')
      
      expect(result).toBeDefined()
      expect(result.quota).toBe(1000)
    })
  })

  describe('recordOrganizationUsage', () => {
    it('should record usage correctly', async () => {
      mockPrisma.organizationUsage.create.mockResolvedValue({
        id: 'usage-1',
        organizationId: 'org-1',
        userId: 'user-1',
        amount: 100,
        type: 'task',
        description: 'Test usage',
        createdAt: new Date()
      })

      const result = await recordOrganizationUsage('org-1', 'user-1', 100, 'task', 'Test usage')
      
      expect(result).toBeDefined()
    })
  })
})
