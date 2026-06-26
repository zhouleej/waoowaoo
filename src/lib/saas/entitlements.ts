import { prisma } from '@/lib/prisma'

function numberFromJson(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>
    const candidate = Number(record.amount ?? record.limit ?? record.value)
    return Number.isFinite(candidate) ? candidate : 0
  }
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

export async function resolveUserActiveOrganization(userId: string) {
  return prisma.organizationMember.findFirst({
    where: { userId, status: 'active', organization: { status: 'active' } },
    orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
    include: { organization: { include: { currentPlan: { include: { entitlements: true } } } } },
  })
}

export async function assertOrganizationCanConsume(userId: string, estimatedCost: number, taskType?: string) {
  const membership = await resolveUserActiveOrganization(userId)
  if (!membership) return null
  const organization = membership.organization
  if (organization.status !== 'active') throw new Error('企业已被禁用')
  if (membership.status !== 'active') throw new Error('成员已被禁用')
  const plan = organization.currentPlan
  if (plan && plan.status !== 'active') throw new Error('企业套餐不可用')
  const taskTypes = plan?.entitlements.find((item) => item.key === 'taskTypes')?.value
  if (Array.isArray(taskTypes) && taskType && !taskTypes.includes(taskType)) throw new Error('当前套餐不支持该任务类型')
  const memberQuota = Number(membership.quota || 0)
  const memberUsed = Number(membership.quotaUsed || 0)
  if (memberQuota > 0 && memberUsed + estimatedCost > memberQuota) throw new Error('成员配额不足')
  const planCredit = numberFromJson(plan?.entitlements.find((item) => item.key === 'monthlyCredits')?.value)
  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)
  const used = await prisma.organizationUsage.aggregate({ where: { organizationId: organization.id, createdAt: { gte: monthStart } }, _sum: { planCreditAmount: true, amount: true } })
  const planCreditUsed = Number(used._sum.planCreditAmount || 0)
  const planRemaining = Math.max(0, planCredit - planCreditUsed)
  const balanceNeed = Math.max(0, estimatedCost - planRemaining)
  const balance = await prisma.organizationBalance.findUnique({ where: { organizationId: organization.id } })
  const available = balance ? Number(balance.balance) - Number(balance.frozenAmount) : 0
  const allowOverage = plan?.entitlements.find((item) => item.key === 'allowOverage')?.value !== false
  if (balanceNeed > 0 && !allowOverage) throw new Error('套餐权益不足且不允许超额')
  if (balanceNeed > 0 && available < balanceNeed) throw new Error('企业余额不足')
  return { organizationId: organization.id, planCreditApplied: Math.min(estimatedCost, planRemaining), balanceChargeApplied: balanceNeed }
}
