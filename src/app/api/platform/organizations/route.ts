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
    createdAt: org.createdAt,
    updatedAt: org.updatedAt,
    owner: org.owner,
    balance: org.balance,
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