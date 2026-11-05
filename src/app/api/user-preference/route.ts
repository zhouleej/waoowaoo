import { teamPreference, requireWorkspaceManager } from '@/lib/workspace/access'
import { workspaceRuntime } from '@/lib/workspace/runtime'
import { getTeamModelConfig, saveTeamModelConfig } from '@/lib/workspace/model-config'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { ApiError, apiHandler } from '@/lib/api-errors'
import { validateUserArtStyle } from '@/lib/art-styles/custom'

async function validateArtStyleField(value: unknown, userId: string): Promise<string> {
  if (typeof value !== 'string') {
    throw new ApiError('INVALID_PARAMS', {
      code: 'INVALID_ART_STYLE',
      field: 'artStyle',
      message: 'artStyle must be a supported value',
    })
  }
  const artStyle = value.trim()
  return validateUserArtStyle(artStyle, userId)
}

// GET - 获取用户偏好配置
export const GET = apiHandler(async () => {
  // 🔐 统一权限验证
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  const team = await teamPreference()
  if (team) {
    const { customProviders: _providers, customModels: _models, ...preference } = team
    return NextResponse.json({ preference })
  }

  // 获取或创建用户偏好
  const preference = await prisma.userPreference.upsert({
    where: { userId: session.user.id },
    update: {},
    create: { userId: session.user.id }
  })

  return NextResponse.json({ preference })
})

// PATCH - 更新用户偏好配置
export const PATCH = apiHandler(async (request: NextRequest) => {
  // 🔐 统一权限验证
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  const body = await request.json()

  // 只允许更新特定字段
  const allowedFields = [
    'analysisModel',
    'characterModel',
    'locationModel',
    'storyboardModel',
    'editModel',
    'videoModel',
    'audioModel',
    'lipSyncModel',
    'videoRatio',
    'artStyle',
    'ttsRate'
  ]

  const updateData: Record<string, unknown> = {}
  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      if (field === 'artStyle') {
        updateData[field] = await validateArtStyleField(body[field], session.user.id)
        continue
      }
      updateData[field] = body[field]
    }
  }

  if (Object.keys(updateData).length === 0) {
    throw new ApiError('INVALID_PARAMS')
  }

  const workspace = workspaceRuntime()
  if (workspace.organizationId && workspace.billingSource === 'team_api_key') {
    await requireWorkspaceManager()
    const config = await getTeamModelConfig(workspace.organizationId, session.user.id)
    const defaults = { ...config.defaults as Record<string, unknown>, ...updateData }
    await saveTeamModelConfig(workspace.organizationId, session.user.id, { ...config, defaults })
    return NextResponse.json({ preference: defaults })
  }

  // 更新或创建用户偏好
  const preference = await prisma.userPreference.upsert({
    where: { userId: session.user.id },
    update: updateData,
    create: {
      userId: session.user.id,
      ...updateData
    }
  })

  return NextResponse.json({ preference })
})
