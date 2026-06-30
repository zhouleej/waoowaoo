import { NextRequest, NextResponse } from 'next/server'
import { apiHandler } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import { requirePlatformAdmin, createAdminAuditLog } from '@/lib/platform-admin'

/**
 * GET /api/platform/config
 * 获取所有系统配置
 * 返回：配置项列表
 */
export const GET = apiHandler(async () => {
  const authResult = await requirePlatformAdmin()
  if (authResult instanceof NextResponse) return authResult

  const configs = await prisma.systemConfig.findMany({
    orderBy: { key: 'asc' },
  })

  return NextResponse.json({
    data: configs.map((config) => ({
      id: config.id,
      key: config.key,
      value: config.value,
      description: config.description,
      updatedAt: config.updatedAt,
    })),
  })
})

/**
 * PATCH /api/platform/config
 * 更新系统配置
 * 请求体：{ key: string, value: string }
 * 需要记录操作日志
 */
export const PATCH = apiHandler(async (req: NextRequest) => {
  const authResult = await requirePlatformAdmin()
  if (authResult instanceof NextResponse) return authResult

  const { user } = authResult

  const body = await req.json()
  const { key, value } = body

  if (!key || typeof key !== 'string') {
    return NextResponse.json(
      { error: 'Missing or invalid key' },
      { status: 400 }
    )
  }

  if (value === undefined || typeof value !== 'string') {
    return NextResponse.json(
      { error: 'Missing or invalid value' },
      { status: 400 }
    )
  }

  // 检查配置是否存在
  const existingConfig = await prisma.systemConfig.findUnique({
    where: { key },
  })

  let config

  if (existingConfig) {
    // 更新现有配置
    config = await prisma.systemConfig.update({
      where: { key },
      data: {
        value,
        updatedBy: user.id,
      },
    })
  } else {
    // 创建新配置
    config = await prisma.systemConfig.create({
      data: {
        key,
        value,
        updatedBy: user.id,
      },
    })
  }

  // 记录操作日志
  await createAdminAuditLog({
    adminId: user.id,
    action: 'update_config',
    targetType: 'SystemConfig',
    targetId: config.id,
    details: {
      key,
      action: existingConfig ? 'update' : 'create',
    },
  })

  return NextResponse.json({
    message: 'Config updated successfully',
    config: {
      id: config.id,
      key: config.key,
      value: config.value,
      updatedAt: config.updatedAt,
    },
  })
})

/**
 * POST /api/platform/config
 * 创建新的系统配置
 * 请求体：{ key: string, value: string, description?: string }
 * 如果 key 已存在则返回错误
 */
export const POST = apiHandler(async (req: NextRequest) => {
  const authResult = await requirePlatformAdmin()
  if (authResult instanceof NextResponse) return authResult

  const { user } = authResult

  const body = await req.json()
  const { key, value, description } = body

  if (!key || typeof key !== 'string') {
    return NextResponse.json(
      { error: 'Missing or invalid key' },
      { status: 400 }
    )
  }

  if (value === undefined || typeof value !== 'string') {
    return NextResponse.json(
      { error: 'Missing or invalid value' },
      { status: 400 }
    )
  }

  // 检查 key 是否已存在
  const existingConfig = await prisma.systemConfig.findUnique({
    where: { key },
  })

  if (existingConfig) {
    return NextResponse.json(
      { error: `Config key "${key}" already exists` },
      { status: 409 }
    )
  }

  const config = await prisma.systemConfig.create({
    data: {
      key,
      value,
      description: description || null,
      updatedBy: user.id,
    },
  })

  // 记录操作日志
  await createAdminAuditLog({
    adminId: user.id,
    action: 'create_config',
    targetType: 'SystemConfig',
    targetId: config.id,
    details: {
      key,
      description: description || null,
    },
  })

  return NextResponse.json({
    message: 'Config created successfully',
    config: {
      id: config.id,
      key: config.key,
      value: config.value,
      description: config.description,
      updatedAt: config.updatedAt,
    },
  })
})
