import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePlatformAdmin, createAdminAuditLog } from '@/lib/platform-admin'
import { addOrganizationBalance } from '@/lib/billing/organization'
import { apiHandler } from '@/lib/api-errors'

/**
 * POST /api/platform/organizations/[id]/balance
 * 平台管理员增加组织余额
 * 请求体：{ amount: number, reason?: string }
 */
export const POST = apiHandler<{ id: string }>(async (req, { params }) => {
  const authResult = await requirePlatformAdmin()
  if (authResult instanceof NextResponse) return authResult

  const { user } = authResult
  const { id } = await params

  const body = await req.json()
  const { amount, reason, idempotencyKey } = body

  // 验证金额
  if (typeof amount !== 'number' || amount <= 0) {
    return NextResponse.json(
      { error: 'Amount must be a positive number' },
      { status: 400 }
    )
  }

  // 检查组织是否存在
  const organization = await prisma.organization.findUnique({
    where: { id },
    select: { id: true, name: true, slug: true },
  })

  if (!organization) {
    return NextResponse.json(
      { error: 'Organization not found' },
      { status: 404 }
    )
  }

  const balance = await addOrganizationBalance(id, amount, {
    reason: reason || '平台管理员增加组织余额',
    operatorId: user.id,
    idempotencyKey,
  })

  // 记录操作日志
  await createAdminAuditLog({
    adminId: user.id,
    action: 'add_organization_balance',
    targetType: 'Organization',
    targetId: id,
    details: {
      amount,
      reason: reason || null,
      organizationName: organization.name,
      organizationSlug: organization.slug,
      newBalance: balance.balance,
    },
  })

  return NextResponse.json({
    message: 'Balance added successfully',
    organization: {
      id: organization.id,
      name: organization.name,
    },
    balance: {
      current: balance.balance,
      added: amount,
      frozenAmount: balance.frozenAmount,
      totalSpent: balance.totalSpent,
    },
  })
})
