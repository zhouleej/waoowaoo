import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withPrismaRetry } from '@/lib/prisma-retry'
import { requireUserAuth, isErrorResponse, forbidden, notFound, badRequest } from '@/lib/api-auth'
import { apiHandler } from '@/lib/api-errors'
import { requireOrganizationRole } from '@/lib/saas/permissions'

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

  const permission = await requireOrganizationRole(organizationId, session.user.id, ['owner', 'admin', 'member'])
  if (permission.error) return permission.error

  return NextResponse.json({
    ...organization,
    currentUserRole: permission.membership!.role,
    currentUserStatus: permission.membership!.status,
  })
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

  const permission = await requireOrganizationRole(organizationId, session.user.id, ['owner'])
  if (permission.error) return permission.error

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
        projects: { select: { id: true }, take: 1 },
      },
    })
  )

  if (!organization) {
    return notFound('Organization')
  }

  const permission = await requireOrganizationRole(organizationId, session.user.id, ['owner'])
  if (permission.error) return permission.error

  if (organization.projects.length > 0) {
    return forbidden('组织仍存在项目，禁止硬删除；请先迁移或删除组织项目')
  }

  // 删除组织（仅允许无项目组织）
  await withPrismaRetry(() =>
    prisma.organization.delete({
      where: { id: organizationId },
    })
  )

  return new NextResponse(null, { status: 204 })
})
