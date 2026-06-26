import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePlatformAdmin, createAdminAuditLog } from '@/lib/platform-admin'

/**
 * GET /api/platform/organizations
 * 获取所有组织（分页）
 * 查询参数：page, limit, search, status
 * 返回：组织列表（包含余额、成员数量）
 */
export async function GET(req: NextRequest) {
  const authResult = await requirePlatformAdmin()
  if (authResult instanceof NextResponse) return authResult

  const { searchParams } = new URL(req.url)

  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '10')
  const search = searchParams.get('search') || ''
  const status = searchParams.get('status') || ''

  const where: Record<string, unknown> = {}

  if (search) {
    where.OR = [
      { name: { contains: search } },
      { slug: { contains: search } },
    ]
  }

  if (status) {
    where.status = status
  }

  const [organizations, total] = await Promise.all([
    prisma.organization.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        balance: true,
        currentPlan: true,
        subscriptions: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          include: { plan: true },
        },
        _count: {
          select: {
            members: true,
          },
        },
      },
    }),
    prisma.organization.count({ where }),
  ])

  const result = organizations.map((org) => ({
    id: org.id,
    name: org.name,
    slug: org.slug,
    status: org.status,
    businessStatus: org.businessStatus,
    createdAt: org.createdAt,
    updatedAt: org.updatedAt,
    owner: org.owner,
    balance: org.balance ? {
      balance: Number(org.balance.balance),
      frozenAmount: Number(org.balance.frozenAmount),
      totalSpent: Number(org.balance.totalSpent),
    } : null,
    currentPlan: org.currentPlan,
    currentSubscription: org.subscriptions[0] || null,
    memberCount: org._count.members,
  }))

  return NextResponse.json({
    data: result,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  })
}

/**
 * POST /api/platform/organizations
 * 创建组织
 */
export async function POST(req: NextRequest) {
  const authResult = await requirePlatformAdmin()
  if (authResult instanceof NextResponse) return authResult
  const { user } = authResult

  const body = await req.json()
  const { name, slug, ownerId, status = 'active', settings } = body

  if (!name || !slug) {
    return NextResponse.json({ error: 'name and slug are required' }, { status: 400 })
  }

  const existing = await prisma.organization.findUnique({ where: { slug } })
  if (existing) {
    return NextResponse.json({ error: 'slug already exists' }, { status: 409 })
  }

  const organization = await prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: {
        name,
        slug,
        ownerId: ownerId || user.id,
        status,
        settings: settings && typeof settings === 'object' ? settings : undefined,
      },
    })

    await tx.organizationBalance.create({
      data: {
        organizationId: org.id,
        balance: 0,
        frozenAmount: 0,
        totalSpent: 0,
      },
    })

    await tx.organizationMember.create({
      data: {
        organizationId: org.id,
        userId: ownerId || user.id,
        role: 'owner',
        status: 'active',
      },
    })

    return org
  })

  await createAdminAuditLog({
    adminId: user.id,
    action: 'create_organization',
    targetType: 'Organization',
    targetId: organization.id,
    details: { name, slug },
  })

  return NextResponse.json({ data: organization }, { status: 201 })
}
