import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withPrismaRetry } from '@/lib/prisma-retry'
import { requireUserAuth, isErrorResponse, unauthorized, forbidden, notFound, badRequest } from '@/lib/api-auth'
import { apiHandler } from '@/lib/api-errors'

type RouteParams = {
  id: string
}

/**
 * GET /api/organizations/[id]
 * 获取组织详情
 */
export const GET = apiHandler(async (_req, ctx) => {
  const params = await ctx.params
  const organizationId = params.id as string

  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  const organization = await withPrismaRetry(() =>
    prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true,
              },
            },
          },
        },
        balance: true,
      },
    })
  )

  if (!organization) {
    return notFound('Organization')
  }

  // 检查用户是否为成员
  const isMember = organization.members.some((m) => m.user.id === session.user.id)
  if (!isMember) {
    return forbidden('您不是该组织成员')
  }

  return NextResponse.json(organization)
})

/**
 * PATCH /api/organizations/[id]
 * 更新组织
 * 请求体: { name?: string }
 * 权限: 仅 owner 可更新
 */
export const PATCH = apiHandler(async (req, ctx) => {
  const params = await ctx.params
  const organizationId = params.id as string

  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  const body = await req.json()
  const { name } = body

  if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
    return badRequest('组织名称不能为空')
  }

  // 获取组织并验证权限
  const organization = await withPrismaRetry(() =>
    prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        members: true,
      },
    })
  )

  if (!organization) {
    return notFound('Organization')
  }

  // 检查用户是否为 owner
  const membership = (organization as { members: Array<{ userId: string; role: string }> }).members.find((m) => m.userId === session.user.id)
  if (!membership || membership.role !== 'owner') {
    return forbidden('只有组织所有者可以更新组织')
  }

  // 更新组织
  const updated = await withPrismaRetry(() =>
    prisma.organization.update({
      where: { id: organizationId },
      data: {
        ...(name ? { name: name.trim() } : {}),
      },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true,
              },
            },
          },
        },
        balance: true,
      },
    })
  )

  return NextResponse.json(updated)
})

/**
 * DELETE /api/organizations/[id]
 * 删除组织
 * 权限: 仅 owner 可删除
 */
export const DELETE = apiHandler(async (_req, ctx) => {
  const params = await ctx.params
  const organizationId = params.id as string

  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  // 获取组织并验证权限
  const organization = await withPrismaRetry(() =>
    prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        members: true,
      },
    })
  )

  if (!organization) {
    return notFound('Organization')
  }

  // 检查用户是否为 owner
  const membership = (organization as { members: Array<{ userId: string; role: string }> }).members.find((m) => m.userId === session.user.id)
  if (!membership || membership.role !== 'owner') {
    return forbidden('只有组织所有者可以删除组织')
  }

  // 删除组织（级联删除会删除成员和余额）
  await withPrismaRetry(() =>
    prisma.organization.delete({
      where: { id: organizationId },
    })
  )

  return new NextResponse(null, { status: 204 })
})