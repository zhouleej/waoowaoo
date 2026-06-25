import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePlatformAdmin, createAdminAuditLog } from '@/lib/platform-admin'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/platform/users/[id]
 * 获取用户详情
 * 返回：用户信息及所属组织、消费记录
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
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
}

/**
 * PATCH /api/platform/users/[id]
 * 更新用户平台属性
 * 请求体：{ isPlatformAdmin?: boolean, isGlobalLocked?: boolean }
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const authResult = await requirePlatformAdmin()
  if (authResult instanceof NextResponse) return authResult

  const { user } = authResult
  const { id } = await params

  const body = await req.json()
  const { isPlatformAdmin, isGlobalLocked } = body

  // 验证至少有一个有效字段
  if (isPlatformAdmin === undefined && isGlobalLocked === undefined) {
    return NextResponse.json(
      { error: 'At least one of isPlatformAdmin or isGlobalLocked is required' },
      { status: 400 }
    )
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
  if (isPlatformAdmin !== undefined) updateData.isPlatformAdmin = isPlatformAdmin
  if (isGlobalLocked !== undefined) updateData.isGlobalLocked = isGlobalLocked

  const updatedUser = await prisma.user.update({
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
}