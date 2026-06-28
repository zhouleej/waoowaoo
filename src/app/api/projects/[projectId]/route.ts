import { logInfo as _ulogInfo, logError as _ulogError } from '@/lib/logging/core'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { addSignedUrlsToProject, deleteObjects } from '@/lib/storage'
import { resolveStorageKeyFromMediaValue } from '@/lib/media/service'
import { logProjectAction } from '@/lib/logging/semantic'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import type { Prisma } from '@prisma/client'
import {
  collectProjectBailianManagedVoiceIds,
  cleanupUnreferencedBailianVoices,
} from '@/lib/providers/bailian'

const PROJECT_PATCH_BLOCKED_FIELDS = new Set([
  'id',
  'userId',
  'organizationId',
  'createdAt',
  'updatedAt',
  'lastAccessedAt',
])

function pickProjectPatchData(body: unknown): Prisma.ProjectUpdateInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError('INVALID_PARAMS', { message: '请求体必须是JSON对象' })
  }

  const input = body as Record<string, unknown>
  for (const field of PROJECT_PATCH_BLOCKED_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(input, field)) {
      throw new ApiError('INVALID_PARAMS', { message: `不允许更新项目归属字段 ${field}` })
    }
  }

  const data: Prisma.ProjectUpdateInput = {}
  if (Object.prototype.hasOwnProperty.call(input, 'name')) {
    if (typeof input.name !== 'string' || !input.name.trim()) {
      throw new ApiError('INVALID_PARAMS', { message: '项目名称不能为空' })
    }
    data.name = input.name.trim()
  }
  if (Object.prototype.hasOwnProperty.call(input, 'description')) {
    if (input.description !== null && input.description !== undefined && typeof input.description !== 'string') {
      throw new ApiError('INVALID_PARAMS', { message: '项目描述格式不正确' })
    }
    data.description = typeof input.description === 'string' && input.description.trim()
      ? input.description.trim()
      : null
  }

  if (Object.keys(data).length === 0) {
    throw new ApiError('INVALID_PARAMS', { message: '没有可更新的项目字段' })
  }

  return data
}

// GET - 获取项目详情
export const GET = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params
  // 🔐 统一权限验证
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  // 只获取基础项目信息，不包含模式特定数据
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      user: true
    }
  })

  if (!project) {
    throw new ApiError('NOT_FOUND')
  }

  // 更新最近访问时间（异步，不阻塞响应）
  prisma.project.update({
    where: { id: projectId },
    data: { lastAccessedAt: new Date() }
  }).catch(err => _ulogError('更新访问时间失败:', err))

  // 这个 API 只返回基础项目信息
  // 项目附属业务数据通过各自的 API 获取（如 /api/novel-promotion/[projectId]）
  const projectWithSignedUrls = addSignedUrlsToProject(project)

  return NextResponse.json({ project: projectWithSignedUrls })
})

// PATCH - 更新项目配置
export const PATCH = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params
  // 🔐 统一权限验证
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult
  const session = authResult.session
  const body = await request.json()

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { user: true }
  })

  if (!project) {
    throw new ApiError('NOT_FOUND')
  }

  // 更新项目
  const updateData = pickProjectPatchData(body)
  const updatedProject = await prisma.project.update({
    where: { id: projectId },
    data: updateData
  })

  logProjectAction(
    'UPDATE',
    session.user.id,
    session.user.name,
    projectId,
    updatedProject.name,
    { changes: updateData }
  )

  return NextResponse.json({ project: updatedProject })
})

/**
 * 收集项目的所有COS文件Key
 */
async function collectProjectCOSKeys(projectId: string): Promise<string[]> {
  const keys: string[] = []

  // 获取 NovelPromotionProject
  const novelPromotion = await prisma.novelPromotionProject.findUnique({
    where: { projectId },
    include: {
      // 角色及其形象图片
      characters: {
        include: {
          appearances: true
        }
      },
      // 场景及其图片
      locations: {
        include: {
          images: true
        }
      },
      // 剧集（包含音频、分镜等）
      episodes: {
        include: {
          storyboards: {
            include: {
              panels: true
            }
          }
        }
      }
    }
  })

  if (!novelPromotion) return keys

  // 1. 收集角色形象图片
  for (const character of novelPromotion.characters) {
    for (const appearance of character.appearances) {
      const key = await resolveStorageKeyFromMediaValue(appearance.imageUrl)
      if (key) keys.push(key)
    }
  }

  // 2. 收集场景图片
  for (const location of novelPromotion.locations) {
    for (const image of location.images) {
      const key = await resolveStorageKeyFromMediaValue(image.imageUrl)
      if (key) keys.push(key)
    }
  }

  // 3. 收集剧集相关文件
  for (const episode of novelPromotion.episodes) {
    // 音频文件
    const audioKey = await resolveStorageKeyFromMediaValue(episode.audioUrl)
    if (audioKey) keys.push(audioKey)

    // 分镜图片
    for (const storyboard of episode.storyboards) {
      // 分镜整体图
      const sbKey = await resolveStorageKeyFromMediaValue(storyboard.storyboardImageUrl)
      if (sbKey) keys.push(sbKey)

      // 候选图片（JSON数组）
      if (storyboard.candidateImages) {
        try {
          const candidates = JSON.parse(storyboard.candidateImages)
          for (const url of candidates) {
            const key = await resolveStorageKeyFromMediaValue(url)
            if (key) keys.push(key)
          }
        } catch { }
      }

      // Panel 表中的图片和视频
      for (const panel of storyboard.panels) {
        const imgKey = await resolveStorageKeyFromMediaValue(panel.imageUrl)
        if (imgKey) keys.push(imgKey)

        const videoKey = await resolveStorageKeyFromMediaValue(panel.videoUrl)
        if (videoKey) keys.push(videoKey)
      }
    }
  }

  _ulogInfo(`[Project ${projectId}] 收集到 ${keys.length} 个 COS 文件待删除`)
  return keys
}

// DELETE - 删除项目（同时清理COS文件）
export const DELETE = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params
  // 🔐 统一权限验证
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult
  const session = authResult.session

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { user: true }
  })

  if (!project) {
    throw new ApiError('NOT_FOUND')
  }

  // 删除仍保持创建者权限，避免普通组织成员误删共享项目。
  if (project.userId !== session.user.id) {
    throw new ApiError('FORBIDDEN')
  }

  // 1. 先收集所有 COS 文件 Key
  _ulogInfo(`[DELETE] 开始删除项目: ${project.name} (${projectId})`)
  const projectVoiceIds = await collectProjectBailianManagedVoiceIds(projectId)
  const voiceCleanupResult = await cleanupUnreferencedBailianVoices({
    voiceIds: projectVoiceIds,
    scope: {
      userId: session.user.id,
      excludeProjectId: projectId,
    },
  })
  const cosKeys = await collectProjectCOSKeys(projectId)

  // 2. 批量删除 COS 文件
  let cosResult = { success: 0, failed: 0 }
  if (cosKeys.length > 0) {
    _ulogInfo(`[DELETE] 正在删除 ${cosKeys.length} 个 COS 文件...`)
    cosResult = await deleteObjects(cosKeys)
  }

  // 3. 删除数据库记录 (级联删除所有关联数据)
  await prisma.project.delete({
    where: { id: projectId }
  })

  logProjectAction(
    'DELETE',
    session.user.id,
    session.user.name,
    projectId,
    project.name,
    {
      projectName: project.name,
      cosFilesDeleted: cosResult.success,
      cosFilesFailed: cosResult.failed,
      bailianVoicesDeleted: voiceCleanupResult.deletedVoiceIds.length,
      bailianVoicesSkippedReferenced: voiceCleanupResult.skippedReferencedVoiceIds.length,
    }
  )

  _ulogInfo(`[DELETE] 项目删除完成: ${project.name}`)
  _ulogInfo(`[DELETE] COS 文件: 成功 ${cosResult.success}, 失败 ${cosResult.failed}`)
  _ulogInfo(`[DELETE] Bailian 音色: 删除 ${voiceCleanupResult.deletedVoiceIds.length}, 跳过(仍被引用) ${voiceCleanupResult.skippedReferencedVoiceIds.length}`)

  return NextResponse.json({
    success: true,
    cosFilesDeleted: cosResult.success,
    cosFilesFailed: cosResult.failed,
    bailianVoicesDeleted: voiceCleanupResult.deletedVoiceIds.length,
    bailianVoicesSkippedReferenced: voiceCleanupResult.skippedReferencedVoiceIds.length,
  })
})
