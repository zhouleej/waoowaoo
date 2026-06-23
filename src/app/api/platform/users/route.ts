import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePlatformAdmin, createAdminAuditLog } from '@/lib/platform-admin'

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

/**
 * POST /api/platform/users
 * 创建用户
 */
export async function POST(req: NextRequest) {
  const authResult = await requirePlatformAdmin()
  if (authResult instanceof NextResponse) return authResult
  const { user: admin } = authResult

  const body = await req.json()
  const { name, email, password } = body

  if (!name || !password) {
    return NextResponse.json({ error: 'name and password are required' }, { status: 400 })
  }

  const existingUser = await prisma.user.findUnique({ where: { name } })
  if (existingUser) {
    return NextResponse.json({ error: 'username already exists' }, { status: 409 })
  }

  if (email) {
    const existingEmail = await prisma.user.findFirst({ where: { email } })
    if (existingEmail) {
      return NextResponse.json({ error: 'email already exists' }, { status: 409 })
    }
  }

  const bcrypt = require('bcryptjs')
  const hashedPassword = await bcrypt.hash(password, 12)

  const newUser = await prisma.user.create({
    data: {
      name,
      email: email || null,
      password: hashedPassword,
      isPlatformAdmin: false,
      isGlobalLocked: false,
    },
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
    },
  })

  await createAdminAuditLog({
    adminId: admin.id,
    action: 'create_user',
    targetType: 'User',
    targetId: newUser.id,
    details: { name, email },
  })

  return NextResponse.json({ data: newUser }, { status: 201 })
}