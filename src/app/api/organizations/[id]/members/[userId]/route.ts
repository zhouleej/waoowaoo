import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withPrismaRetry } from '@/lib/prisma-retry'
import { requireUserAuth, isErrorResponse, forbidden, notFound, badRequest } from '@/lib/api-auth'
import { apiHandler } from '@/lib/api-errors'
import { requireOrganizationRole, writeEnterpriseAudit } from '@/lib/saas/permissions'

/**
 * PATCH /api/organizations/[id]/members/[userId]
 * 更新成员
 * 请求体: { role?: string, quota?: number, status?: string }
 * 权限: owner 可修改任何成员，admin 可修改普通成员
 */
export const PATCH = apiHandler(async (req, ctx) => {
  const params = await ctx.params
  const organizationId = params.id as string
  const targetUserId = params.userId as string

  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  // 不能修改自己的成员信息
  if (targetUserId === session.user.id) {
    return badRequest('不能修改自己的成员信息')
  }

  const permResult = await requireOrganizationRole(organizationId, session.user.id, ['owner', 'admin'])
  if (permResult.error) return permResult.error

  const { membership: currentUser } = permResult

  // 检查目标成员是否存在
  const targetMember = await withPrismaRetry(() =>
    prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId,
          userId: targetUserId,
        },
      },
    })
  )

  if (!targetMember) {
    return notFound('Member')
  }

  // admin 不能修改 owner 或其他 admin
  if (currentUser?.role === 'admin') {
    if (targetMember.role === 'owner' || targetMember.role === 'admin') {
      return forbidden('管理员不能修改所有者或其他管理员的权限')
    }
  }

  const body = await req.json()
  const { role, quota, status } = body

  // 验证 role
  if (role !== undefined) {
    if (role !== 'admin' && role !== 'member') {
      return badRequest('角色只能是 admin 或 member')
    }

    // owner 不能被修改为其他角色
    if (targetMember.role === 'owner') {
      return forbidden('不能修改所有者的角色')
    }

  }

  // 验证 status
  if (status !== undefined) {
    if (status !== 'active' && status !== 'frozen') {
      return badRequest('状态只能是 active 或 frozen')
    }
  }

  // 验证 quota
  if (quota !== undefined) {
    if (typeof quota !== 'number' || quota < 0) {
      return badRequest('配额必须是非负数')
    }
  }

  // 更新成员
  const updated = await withPrismaRetry(() =>
    prisma.organizationMember.update({
      where: {
        organizationId_userId: {
          organizationId,
          userId: targetUserId,
        },
      },
      data: {
        ...(role ? { role } : {}),
        ...(typeof quota === 'number' ? { quota } : {}),
        ...(status ? { status } : {}),
      },
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
    })
  )
  await writeEnterpriseAudit({ organizationId, actorId: session.user.id, action: 'update_member', targetType: 'OrganizationMember', targetId: updated.id, details: { targetUserId, changed: Object.keys(body) } })

  return NextResponse.json(updated)
})

/**
 * DELETE /api/organizations/[id]/members/[userId]
 * 移除成员
 * 权限: owner 或 admin，不能移除自己
 */
export const DELETE = apiHandler(async (_req, ctx) => {
  const params = await ctx.params
  const organizationId = params.id as string
  const targetUserId = params.userId as string

  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  // 不能移除自己
  if (targetUserId === session.user.id) {
    return badRequest('不能移除自己')
  }

  const permResult = await requireOrganizationRole(organizationId, session.user.id, ['owner', 'admin'])
  if (permResult.error) return permResult.error

  const { membership: currentUser } = permResult

  // 检查目标成员是否存在
  const targetMember = await withPrismaRetry(() =>
    prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId,
          userId: targetUserId,
        },
      },
    })
  )

  if (!targetMember) {
    return notFound('Member')
  }

  // 不能移除 owner
  if (targetMember.role === 'owner') {
    return forbidden('不能移除组织所有者')
  }

  // admin 不能移除其他 admin
  if (currentUser?.role === 'admin' && targetMember.role === 'admin') {
    return forbidden('管理员不能移除其他管理员')
  }

  // 移除成员
  await withPrismaRetry(() =>
    prisma.organizationMember.delete({
      where: {
        organizationId_userId: {
          organizationId,
          userId: targetUserId,
        },
      },
    })
  )
  await writeEnterpriseAudit({ organizationId, actorId: session.user.id, action: 'remove_member', targetType: 'OrganizationMember', targetId: targetMember.id, details: { targetUserId } })

  return new NextResponse(null, { status: 204 })
})
