import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePlatformAdmin } from '@/lib/platform-admin'

/**
 * GET /api/platform/users
 * 获取所有用户（分页）
 * 查询参数：page, limit, search
 * 返回：用户列表
 */
export async function GET(req: NextRequest) {
  const authResult = await requirePlatformAdmin()
  if (authResult instanceof NextResponse) return authResult

  const { searchParams } = new URL(req.url)

  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '10')
  const search = searchParams.get('search') || ''

  const where: Record<string, unknown> = {}

  if (search) {
    where.OR = [
      { name: { contains: search } },
      { email: { contains: search } },
    ]
  }

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        createdAt: true,
        updatedAt: true,
        isPlatformAdmin: true,
        isGlobalLocked: true,
        _count: {
          select: {
            projects: true,
            accounts: true,
          },
        },
      },
    }),
    prisma.user.count({ where }),
  ])

  const result = users.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    isPlatformAdmin: user.isPlatformAdmin,
    isGlobalLocked: user.isGlobalLocked,
    projectCount: user._count.projects,
    linkedAccounts: user._count.accounts,
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