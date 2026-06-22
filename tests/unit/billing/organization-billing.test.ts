import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock prisma module
const mockPrisma = {
  organizationBalance: {
    findUnique: vi.fn(),
    update: vi.fn(),
    create: vi.fn()
  },
  organizationMember: {
    findUnique: vi.fn()
  },
  organizationUsage: {
    create: vi.fn(),
    aggregate: vi.fn().mockResolvedValue({ _sum: { amount: 0 } })
  },
  $transaction: vi.fn((callback) => callback(mockPrisma))
}

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma
}))

// Import after mocking
const { 
  getOrganizationBalance, 
  addOrganizationBalance,
  checkOrganizationBalance,
  checkMemberQuota,
  recordOrganizationUsage
} = await import('@/lib/billing/organization')

describe('Organization Billing Core Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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