import { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { teamMember } from '@/lib/workspace/teams'
import { budgetMonth, memberBudget } from '@/lib/workspace/budget'
export const GET = apiHandler(async (req, ctx) => {
  const auth = await requireUserAuth()
  if (isErrorResponse(auth)) return auth
  const { id } = await ctx.params
  const organizationId = String(id), userId = auth.session.user.id
  const member = await teamMember(organizationId, userId)
  const manager = ['owner', 'admin'].includes(member.role)
  const period = req.nextUrl.searchParams.get('period') ?? budgetMonth()
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new ApiError('INVALID_PARAMS')
  const filterUser = manager ? req.nextUrl.searchParams.get('userId') : userId
  const where: Prisma.OrganizationUsageRecordWhereInput = {
    organizationId, period, ...(filterUser ? { userId: filterUser } : {}),
    ...(req.nextUrl.searchParams.get('projectId') ? { projectId: req.nextUrl.searchParams.get('projectId')! } : {}),
    ...(req.nextUrl.searchParams.get('model') ? { model: req.nextUrl.searchParams.get('model')! } : {}),
  }
  const offset = Math.max(0, Math.min(1000000, Number(req.nextUrl.searchParams.get('offset')) || 0))
  const [data, aggregate] = await Promise.all([
    prisma.organizationUsageRecord.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 100, skip: offset }),
    prisma.organizationUsageRecord.aggregate({ where, _sum: { amount: true }, _count: true }),
  ])
  return NextResponse.json({ data, total: aggregate._count, estimatedTotal: Number(aggregate._sum.amount ?? 0), offset, budget: await memberBudget(organizationId, userId, period), canManage: manager })
})
