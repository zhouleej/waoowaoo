import { randomUUID } from 'node:crypto'
import { Prisma, type OrganizationBudgetPeriod } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { WorkspaceError as ApiError } from './errors'
import { roundMoney } from '@/lib/billing/money'
import { readTeamConfig } from './access'
import { workspaceRuntime, withWorkspaceRuntime } from './runtime'
import { assertTeamCallsEnabled } from './availability'

export function budgetMonth(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit' }).format(date).slice(0, 7)
}

function money(value: number) { return roundMoney(value, 6) }

async function lockedPeriod(tx: Prisma.TransactionClient, organizationId: string, userId: string, period: string) {
  const row = await tx.organizationBudgetPeriod.upsert({ where: { organizationId_userId_period: { organizationId, userId, period } }, create: { organizationId, userId, period }, update: {} })
  const [locked] = await tx.$queryRaw<OrganizationBudgetPeriod[]>`SELECT * FROM organization_budget_periods WHERE id = ${row.id} FOR UPDATE`
  return locked
}

export async function reserveTeamBudget(input: { organizationId: string; userId: string; taskId: string; amount: number; period?: string }) {
  if (!Number.isFinite(input.amount) || input.amount < 0) throw new ApiError('INVALID_PARAMS')
  return prisma.$transaction(async tx => {
    const row = await lockedPeriod(tx, input.organizationId, input.userId, input.period ?? budgetMonth())
    const existing = await tx.organizationBudgetReservation.findUnique({ where: { taskId: input.taskId } })
    if (existing) return existing
    const member = await tx.organizationMember.findUnique({ where: { organizationId_userId: { organizationId: input.organizationId, userId: input.userId } }, include: { organization: true } })
    if (!member || member.status !== 'active' || member.organization.status !== 'active') throw new ApiError('FORBIDDEN')
    const amount = money(input.amount)
    if (Number(member.quota) > 0 && (money(Number(row.spent) + Number(row.reserved)) >= Number(member.quota) || money(Number(row.spent) + Number(row.reserved) + amount) > Number(member.quota))) throw new ApiError('QUOTA_EXCEEDED', { message: '团队月度预算不足 / Monthly team budget exceeded' })
    await tx.organizationBudgetPeriod.update({ where: { id: row.id }, data: { reserved: { increment: amount } } })
    return tx.organizationBudgetReservation.create({ data: { taskId: input.taskId, periodId: row.id, organizationId: input.organizationId, userId: input.userId, amount } })
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted })
}

export async function releaseTeamReservation(taskId: string) {
  const found = await prisma.organizationBudgetReservation.findUnique({ where: { taskId } })
  if (!found) return
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM organization_budget_periods WHERE id = ${found.periodId} FOR UPDATE`
    const reservation = await tx.organizationBudgetReservation.findUniqueOrThrow({ where: { taskId } })
    if (reservation.status !== 'reserved') return
    // Accepted calls remain chargeable, even when the surrounding task is canceled.
    await tx.organizationBudgetPeriod.update({ where: { id: reservation.periodId }, data: {
      reserved: { decrement: reservation.amount }, spent: { increment: reservation.committed },
    } })
    await tx.organizationBudgetReservation.update({ where: { id: reservation.id }, data: { status: 'settled' } })
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted })
}

export async function authorizeTeamCall(input: { taskId: string; model: string; amount: number; quantity: number; unit: string; kind: string }) {
  const runtime = workspaceRuntime()
  const config = await readTeamConfig()
  if (!config || !runtime.organizationId || !runtime.actorId) return null
  const reservation = await reserveTeamBudget({ organizationId: runtime.organizationId, userId: runtime.actorId, taskId: input.taskId, amount: 0 })
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM organization_budget_periods WHERE id = ${reservation.periodId} FOR UPDATE`
    const current = await tx.organizationBudgetReservation.findUniqueOrThrow({ where: { taskId: input.taskId } })
    if (current.status !== 'reserved') throw new ApiError('CONFLICT', { message: 'Task budget already settled' })
    const member = await tx.organizationMember.findUnique({ where: { organizationId_userId: { organizationId: runtime.organizationId!, userId: runtime.actorId! } }, include: { organization: true, user: { select: { name: true, isGlobalLocked: true } } } })
    if (!member || member.status !== 'active' || member.organization.status !== 'active' || member.user.isGlobalLocked) throw new ApiError('FORBIDDEN')
    const amount = money(input.amount)
    const committed = money(Number(current.committed) + amount)
    const extra = Math.max(0, money(committed - Number(current.amount)))
    const period = await tx.organizationBudgetPeriod.findUniqueOrThrow({ where: { id: current.periodId } })
    if (Number(member.quota) > 0 && money(Number(period.spent) + Number(period.reserved) + extra) > Number(member.quota)) throw new ApiError('QUOTA_EXCEEDED', { message: '团队月度预算不足 / Monthly team budget exceeded' })
    if (extra > 0) await tx.organizationBudgetPeriod.update({ where: { id: period.id }, data: { reserved: { increment: extra } } })
    await tx.organizationBudgetReservation.update({ where: { id: current.id }, data: { amount: { increment: extra }, committed } })
    return tx.organizationUsageRecord.create({ data: {
      callKey: randomUUID(), taskId: input.taskId, organizationId: runtime.organizationId!, userId: runtime.actorId!, userName: member.user.name,
      projectId: runtime.projectId && !runtime.projectId.includes('asset-hub') ? runtime.projectId : null,
      period: period.period, model: input.model, modelConfigVersionId: config.id,
      kind: input.kind, unit: input.unit, quantity: input.quantity, amount,
    } })
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted })
}

async function settleKnownCall(record: { id: string; taskId: string }, quantity: number | undefined, price: number, divisor: number) {
  await prisma.$transaction(async tx => {
    const found = await tx.organizationBudgetReservation.findUniqueOrThrow({ where: { taskId: record.taskId } })
    await tx.$queryRaw`SELECT id FROM organization_budget_periods WHERE id = ${found.periodId} FOR UPDATE`
    const reservation = await tx.organizationBudgetReservation.findUniqueOrThrow({ where: { taskId: record.taskId } })
    const current = await tx.organizationUsageRecord.findUniqueOrThrow({ where: { id: record.id } })
    if (current.status !== 'pending') return
    const amount = quantity === undefined ? Number(current.amount) : money(price * quantity / divisor)
    const difference = money(amount - Number(current.amount))
    // The external request has already completed; known usage must be recorded
    // even if a provider reports more tokens than its advertised output bound.
    const extra = reservation.status === 'reserved' ? Math.max(0, money(Number(reservation.committed) + difference - Number(reservation.amount))) : 0
    await tx.organizationBudgetReservation.update({ where: { id: reservation.id }, data: { committed: { increment: difference }, amount: { increment: extra } } })
    if (extra) await tx.organizationBudgetPeriod.update({ where: { id: reservation.periodId }, data: { reserved: { increment: extra } } })
    if (reservation.status === 'settled') await tx.organizationBudgetPeriod.update({ where: { id: reservation.periodId }, data: { spent: { increment: difference } } })
    await tx.organizationUsageRecord.update({ where: { id: record.id }, data: { amount, ...(quantity === undefined ? {} : { quantity }), status: 'estimated' } })
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted })
}

export function reportedTokenUsage(result: unknown): number | undefined {
  const usage = result && typeof result === 'object' && 'usage' in result ? result.usage : null
  if (!usage || typeof usage !== 'object') return undefined
  const data = usage as Record<string, unknown>
  const total = typeof data.total_tokens === 'number' ? data.total_tokens
    : typeof data.prompt_tokens === 'number' && typeof data.completion_tokens === 'number' ? data.prompt_tokens + data.completion_tokens : undefined
  return total !== undefined && Number.isSafeInteger(total) && total > 0 ? total : undefined
}

export async function withTeamUsage<T>(input: { model: string; kind: string; quantity: number; unit: string; retryBound?: number }, run: () => Promise<T>): Promise<T> {
  const runtime = workspaceRuntime()
  if (!runtime.organizationId || runtime.billingSource !== 'team_api_key' || runtime.callDepth) return run()
  assertTeamCallsEnabled()
  const config = await readTeamConfig()
  const models = JSON.parse(config!.models) as Array<{ provider: string; modelId: string; budgetPrice: number }>
  const model = models.find(item => `${item.provider}::${item.modelId}` === input.model)
  if (!model || !Number.isFinite(model.budgetPrice) || model.budgetPrice < 0) throw new ApiError('INVALID_PARAMS', { message: '请配置团队模型和估算价格 / Configure the team model and budget price' })
  const divisor = input.unit === 'token' ? 1_000_000 : input.unit === 'character' ? 1000 : 1
  const amount = money(model.budgetPrice * Math.max(0, input.quantity) / divisor * (input.retryBound ?? 1))
  const taskId = runtime.taskId ?? `sync:${randomUUID()}`
  const { withTeamConcurrency } = await import('./concurrency')
  try {
    return await withTeamConcurrency(input.kind, async () => {
      const record = await authorizeTeamCall({ ...input, amount, taskId })
      try {
        const result = await withWorkspaceRuntime({ ...runtime, callDepth: 1 }, run)
        if (record) await settleKnownCall(record, input.unit === 'token' ? reportedTokenUsage(result) : undefined, model.budgetPrice, divisor)
        return result
      } catch (error) {
        if (record) await prisma.organizationUsageRecord.update({ where: { id: record.id }, data: { status: 'needs_review' } })
        throw error
      }
    })
  } finally {
    if (!runtime.taskId) await releaseTeamReservation(taskId)
  }
}

export async function memberBudget(organizationId: string, userId: string, period = budgetMonth()) {
  const [member, row] = await Promise.all([
    prisma.organizationMember.findUnique({ where: { organizationId_userId: { organizationId, userId } } }),
    prisma.organizationBudgetPeriod.findUnique({ where: { organizationId_userId_period: { organizationId, userId, period } } }),
  ])
  const limit = Number(member?.quota ?? 0), spent = Number(row?.spent ?? 0), reserved = Number(row?.reserved ?? 0)
  return { period, limit, spent, reserved, remaining: limit === 0 ? null : Math.max(0, money(limit - spent - reserved)), currency: 'CNY' }
}
