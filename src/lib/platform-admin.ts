/**
 * 🔐 平台管理员认证辅助工具
 * 验证用户是否为平台管理员
 */

import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { getErrorSpec } from '@/lib/errors/codes'

interface AuthSession {
  user: {
    id: string
    name?: string | null
    email?: string | null
  }
}

/**
 * 获取平台管理员邮箱列表
 * 从环境变量 PLATFORM_ADMIN_EMAILS 读取
 */
function getPlatformAdminEmails(): string[] {
  const envEmails = process.env.PLATFORM_ADMIN_EMAILS
  if (!envEmails) return []
  return envEmails.split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
}

/**
 * 获取当前登录用户的 Session
 */
export async function getAuthSession(): Promise<AuthSession | null> {
  const session = await getServerSession(authOptions)
  return session as AuthSession | null
}

/**
 * 验证当前用户是否为平台管理员
 * 检查方式：
 * 1. 数据库中 isPlatformAdmin = true
 * 2. 或邮箱在 PLATFORM_ADMIN_EMAILS 环境变量中
 */
export async function checkPlatformAdmin(): Promise<{
  isAdmin: boolean
  user: { id: string; name: string | null; email: string | null } | null
} | NextResponse> {
  const session = await getAuthSession()

  if (!session?.user?.id) {
    return {
      isAdmin: false,
      user: null,
    }
  }

  // 检查用户是否为平台管理员
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      isPlatformAdmin: true,
    },
  })

  if (!user) {
    return {
      isAdmin: false,
      user: null,
    }
  }

  // 检查 isPlatformAdmin 字段
  if (user.isPlatformAdmin) {
    return {
      isAdmin: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    }
  }

  // 检查邮箱是否在环境变量中
  const adminEmails = getPlatformAdminEmails()
  if (user.email && adminEmails.includes(user.email.toLowerCase())) {
    return {
      isAdmin: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    }
  }

  return {
    isAdmin: false,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
    },
  }
}

/**
 * 要求当前用户必须为平台管理员
 * @throws 返回 403 响应
 */
export async function requirePlatformAdmin(): Promise<{
  session: AuthSession
  user: { id: string; name: string | null; email: string | null }
} | NextResponse> {
  const session = await getAuthSession()

  if (!session?.user?.id) {
    const spec = getErrorSpec('UNAUTHORIZED')
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Unauthorized',
          retryable: spec.retryable,
          category: spec.category,
        },
        code: 'UNAUTHORIZED',
        message: 'Unauthorized',
      },
      { status: spec.httpStatus }
    )
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      isPlatformAdmin: true,
    },
  })

  if (!user) {
    const spec = getErrorSpec('FORBIDDEN')
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Forbidden',
          retryable: spec.retryable,
          category: spec.category,
        },
        code: 'FORBIDDEN',
        message: 'Forbidden',
      },
      { status: spec.httpStatus }
    )
  }

  // 检查 isPlatformAdmin 字段
  if (user.isPlatformAdmin) {
    return {
      session,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    }
  }

  // 检查邮箱是否在环境变量中
  const adminEmails = getPlatformAdminEmails()
  if (user.email && adminEmails.includes(user.email.toLowerCase())) {
    return {
      session,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    }
  }

  const spec = getErrorSpec('FORBIDDEN')
  return NextResponse.json(
    {
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Platform admin access required',
        retryable: spec.retryable,
        category: spec.category,
      },
      code: 'FORBIDDEN',
      message: 'Platform admin access required',
    },
    { status: spec.httpStatus }
  )
}

/**
 * 创建管理员操作日志
 */
export async function createAdminAuditLog(params: {
  adminId: string
  action: string
  targetType: string
  targetId?: string
  details?: Record<string, unknown>
  ipAddress?: string
}) {
  return prisma.adminAuditLog.create({
    data: {
      adminId: params.adminId,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId,
      details: params.details ? JSON.stringify(params.details) : null,
      ipAddress: params.ipAddress,
    },
  })
}
