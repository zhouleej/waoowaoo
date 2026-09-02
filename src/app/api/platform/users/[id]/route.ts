import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePlatformAdmin, createAdminAuditLog } from '@/lib/platform-admin'
import { apiHandler } from '@/lib/api-errors'
import { badRequest } from '@/lib/api-auth'
import { readStrictBoolean } from '@/lib/platform/validation'

/**
 * GET /api/platform/users/[id]
 * 获取用户详情
 * 返回：用户信息及所属组织、消费记录
 */
export const GET = apiHandler<{ id: string }>(async (_req, { params }) => {
  const authResult = await requirePlatformAdmin()
  if (authResult instanceof NextResponse) return authResult

  const { id } = await params

  // 获取用户基本信息
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      createdAt: true,
      updatedAt: true,
      isPlatformAdmin: true,
      isGlobalLocked: true,
      balance: true,
    },
  })

  if (!user) {
    return NextResponse.json(
      { error: 'User not found' },
      { status: 404 }
    )
  }

  // 获取用户所属组织
  const memberships = await prisma.organizationMember.findMany({
    where: { userId: id },
    include: {
      organization: {
        include: {
          balance: true,
          currentPlan: true,
          owner: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
    },
    orderBy: { joinedAt: 'desc' },
  })

  const organizations = memberships.map((m) => ({
    id: m.organization.id,
    name: m.organization.name,
    slug: m.organization.slug,
    role: m.role,
    status: m.status,
    quota: m.quota ? Number(m.quota) : 0,
    joinedAt: m.joinedAt,
    balance: m.organization.balance ? {
      balance: Number(m.organization.balance.balance),
      frozenAmount: Number(m.organization.balance.frozenAmount),
      totalSpent: Number(m.organization.balance.totalSpent),
    } : null,
    owner: m.organization.owner,
  }))

  // 获取用户消费记录 (最近10条)
  const usageCosts = await prisma.usageCost.findMany({
    where: { userId: id },
    orderBy: { createdAt: 'desc' },
    take: 10,
    include: {
      project: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  })

  const recentUsage = usageCosts.map((cost) => ({
    id: cost.id,
    apiType: cost.apiType,
    model: cost.model,
    action: cost.action,
    quantity: cost.quantity,
    unit: cost.unit,
    cost: cost.cost,
    createdAt: cost.createdAt,
    projectId: cost.projectId,
    projectName: cost.project?.name,
  }))

  // 获取用户任务统计
  const [totalTasks, activeTasks] = await Promise.all([
    prisma.task.count({ where: { userId: id } }),
    prisma.task.count({ where: { userId: id, status: { in: ['queued', 'processing'] } } }),
  ])

  // 获取用户项目数量
  const projectCount = await prisma.project.count({
    where: { userId: id },
  })

  return NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      isPlatformAdmin: user.isPlatformAdmin,
      isGlobalLocked: user.isGlobalLocked,
      balance: user.balance ? {
        balance: Number(user.balance.balance),
        frozenAmount: Number(user.balance.frozenAmount),
        totalSpent: Number(user.balance.totalSpent),
      } : null,
      projectCount,
      totalTasks,
      activeTasks,
    },
    organizations,
    recentUsage,
  })
})

/**
 * PATCH /api/platform/users/[id]
 * 更新用户平台属性
 * 请求体：{ isPlatformAdmin?: boolean, isGlobalLocked?: boolean }
 */
export const PATCH = apiHandler<{ id: string }>(async (req, { params }) => {
  const authResult = await requirePlatformAdmin()
  if (authResult instanceof NextResponse) return authResult

  const { user } = authResult
  const { id } = await params

  let body: { isPlatformAdmin?: unknown; isGlobalLocked?: unknown }
  try {
    body = await req.json()
  } catch {
    return badRequest('Request body must be valid JSON')
  }
  const { isPlatformAdmin, isGlobalLocked } = body

  // 验证至少有一个有效字段
  if (isPlatformAdmin === undefined && isGlobalLocked === undefined) {
    return NextResponse.json(
      { error: 'At least one of isPlatformAdmin or isGlobalLocked is required' },
      { status: 400 }
    )
  }

  let nextIsPlatformAdmin: boolean | undefined
  let nextIsGlobalLocked: boolean | undefined
  try {
    nextIsPlatformAdmin = isPlatformAdmin === undefined
      ? undefined
      : readStrictBoolean(isPlatformAdmin, 'isPlatformAdmin')
    nextIsGlobalLocked = isGlobalLocked === undefined
      ? undefined
      : readStrictBoolean(isGlobalLocked, 'isGlobalLocked')
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : 'Invalid user attributes')
  }

  if (id === user.id && nextIsPlatformAdmin === false) {
    return badRequest('You cannot remove your own platform administrator role')
  }

  // 检查用户是否存在
  const existingUser = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, isPlatformAdmin: true, isGlobalLocked: true },
  })

  if (!existingUser) {
    return NextResponse.json(
      { error: 'User not found' },
      { status: 404 }
    )
  }

  // 构建更新数据
  const updateData: { isPlatformAdmin?: boolean; isGlobalLocked?: boolean } = {}
  if (nextIsPlatformAdmin !== undefined) updateData.isPlatformAdmin = nextIsPlatformAdmin
  if (nextIsGlobalLocked !== undefined) updateData.isGlobalLocked = nextIsGlobalLocked

  const updatedUser = await prisma.$transaction(async (tx) => {
    if (existingUser.isPlatformAdmin && nextIsPlatformAdmin === false) {
      const platformAdminCount = await tx.user.count({ where: { isPlatformAdmin: true } })
      if (platformAdminCount <= 1) return null
    }

    return tx.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        createdAt: true,
        updatedAt: true,
        isPlatformAdmin: true,
        isGlobalLocked: true,
      },
    })
  }, { isolationLevel: 'Serializable' })

  if (!updatedUser) {
    return badRequest('At least one database platform administrator must remain')
  }

  // 记录操作日志
  await createAdminAuditLog({
    adminId: user.id,
    action: 'update_user',
    targetType: 'User',
    targetId: id,
    details: {
      changes: updateData,
      previousValues: {
        isPlatformAdmin: existingUser.isPlatformAdmin,
        isGlobalLocked: existingUser.isGlobalLocked,
      },
    },
  })

  return NextResponse.json({
    message: 'User updated successfully',
    user: updatedUser,
  })
})

/**
 * DELETE /api/platform/users/[id]
 * 删除用户（平台管理员专用）
 * 注意：不能删除平台管理员自己
 */
export const DELETE = apiHandler<{ id: string }>(async (_req, { params }) => {
  const authResult = await requirePlatformAdmin()
  if (authResult instanceof NextResponse) return authResult
  const { user: admin } = authResult

  const { id } = await params

  // 不能删除自己
  if (id === admin.id) {
    return NextResponse.json({ error: 'Cannot delete yourself' }, { status: 400 })
  }

  // 检查用户是否存在
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      isPlatformAdmin: true,
      _count: { select: { ownedOrganizations: true } },
    },
  })

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  if (user._count.ownedOrganizations > 0) {
    return NextResponse.json({ error: 'User owns organizations; transfer organization ownership before deletion' }, { status: 409 })
  }

  // 使用事务删除用户及其个人数据
  await prisma.$transaction(async (tx) => {
    // 删除组织成员关系
    await tx.organizationMember.deleteMany({ where: { userId: id } })
    // 仅删除个人项目；组织项目由可空创建者关系保留
    await tx.project.deleteMany({ where: { userId: id, organizationId: null } })
    // 删除用户的余额记录
    await tx.userBalance.deleteMany({ where: { userId: id } })
    // 删除用户的 NextAuth 账号
    await tx.account.deleteMany({ where: { userId: id } })
    // 删除用户的 Session
    await tx.session.deleteMany({ where: { userId: id } })
    // 删除用户
    await tx.user.delete({ where: { id } })
  })

  // 记录审计日志
  await createAdminAuditLog({
    adminId: admin.id,
    action: 'delete_user',
    targetType: 'User',
    targetId: id,
    details: {
      name: user.name,
      email: user.email,
    },
  })

  return NextResponse.json({ message: 'User deleted successfully' })
})
