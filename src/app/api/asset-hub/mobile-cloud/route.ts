import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuthLight, requireUserAuth } from '@/lib/api-auth'
import {
  MobileCloudMaasOpenApiError,
  mobileCloudMaasAssetClient,
} from '@/lib/mobile-cloud-maas/asset-client'
import type {
  MobileCloudAssetGroupType,
  MobileCloudAssetStatus,
  MobileCloudAssetType,
} from '@/lib/mobile-cloud-maas/asset-types'
import { createScopedLogger } from '@/lib/logging/core'
import { normalizeToOriginalMediaUrl } from '@/lib/media/outbound-image'
import { getPublicBaseUrl } from '@/lib/env'
import { requireNovelPromotionEpisodeInProject } from '@/lib/saas/novel-promotion-resource-access'
import { prisma } from '@/lib/prisma'

const logger = createScopedLogger({ module: 'api.mobile-cloud-asset' })

const GROUP_TYPES = new Set<MobileCloudAssetGroupType>(['AIGC', 'LivenessFace'])
const ASSET_TYPES = new Set<MobileCloudAssetType>(['Image', 'Video', 'Audio'])
const ASSET_STATUSES = new Set<MobileCloudAssetStatus>(['PROCESSING', 'ACTIVE', 'FAILED'])
const MAX_STORYBOARD_PANEL_ASSETS_PER_REQUEST = 20

function text(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') throw new ApiError('INVALID_PARAMS')
  const normalized = value.trim()
  if (!normalized || normalized.length > maxLength) throw new ApiError('INVALID_PARAMS')
  return normalized
}

function optionalText(value: unknown, maxLength: number): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') throw new ApiError('INVALID_PARAMS')
  const normalized = value.trim()
  if (normalized.length > maxLength) throw new ApiError('INVALID_PARAMS')
  return normalized || undefined
}

function positiveInteger(value: string | null, fallback: number): number {
  if (value === null || value === '') return fallback
  if (!/^\d+$/.test(value)) throw new ApiError('INVALID_PARAMS')
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new ApiError('INVALID_PARAMS')
  return parsed
}

function requireEnum<T extends string>(value: unknown, values: Set<T>): T {
  if (typeof value !== 'string' || !values.has(value as T)) throw new ApiError('INVALID_PARAMS')
  return value as T
}

function parseIdList(value: string | null): string[] | undefined {
  if (!value) return undefined
  const values = value.split(',').map((item) => item.trim()).filter(Boolean)
  if (values.length === 0 || values.length > 50 || values.some((item) => item.length > 200)) {
    throw new ApiError('INVALID_PARAMS')
  }
  return values
}

function requireIdList(value: unknown, maxItems: number): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > maxItems) {
    throw new ApiError('INVALID_PARAMS')
  }
  const ids = value.map((item) => text(item, 200))
  if (new Set(ids).size !== ids.length) throw new ApiError('INVALID_PARAMS')
  return ids
}

function requireHttpUrl(value: unknown): string {
  const normalized = text(value, 2048)
  try {
    const url = new URL(normalized)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('unsupported')
  } catch {
    throw new ApiError('INVALID_PARAMS')
  }
  return normalized
}

function panelAssetName(input: {
  episodeName: string
  episodeNumber: number
  panelIndex: number
  panelNumber: number | null
  panelId: string
  sourceImageUrl: string
  retryAssetId?: string | null
}): string {
  const panelNumber = input.panelNumber ?? input.panelIndex + 1
  const episodeLabel = input.episodeName.trim() || `第${input.episodeNumber}集`
  const panelIdentity = input.panelId.replace(/[^A-Za-z0-9]/g, '').slice(-12) || 'panel'
  const sourceVersion = stableShortHash(input.sourceImageUrl)
  const retrySuffix = input.retryAssetId
    ? `·R${input.retryAssetId.replace(/[^A-Za-z0-9]/g, '').slice(-8) || 'retry'}`
    : ''
  const suffix = `·E${input.episodeNumber}·S${panelNumber}·P${panelIdentity}·V${sourceVersion}${retrySuffix}`
  const maxEpisodeLength = Math.max(1, 64 - suffix.length)
  return `${episodeLabel.slice(0, maxEpisodeLength)}${suffix}`
}

function stableShortHash(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

function storedAssetStatus(value: string | null): MobileCloudAssetStatus {
  return value && ASSET_STATUSES.has(value as MobileCloudAssetStatus)
    ? value as MobileCloudAssetStatus
    : 'PROCESSING'
}

function errorResponse(error: MobileCloudMaasOpenApiError): NextResponse {
  const status = error.kind === 'config' ? 503 : error.kind === 'auth' ? 502 : error.status && error.status >= 400 && error.status < 500 ? error.status : 503
  const code = error.kind === 'config'
    ? 'MOBILE_CLOUD_OPENAPI_CONFIG_MISSING'
    : error.kind === 'auth'
      ? 'MOBILE_CLOUD_OPENAPI_AUTH_FAILED'
      : 'MOBILE_CLOUD_OPENAPI_UNAVAILABLE'

  // Log the full error server-side so operators can diagnose root causes
  // (network failures, upstream rejections, invalid responses) that the
  // generic client-facing message hides.
  logger.error({
    message: 'Mobile Cloud OpenAPI request failed',
    action: 'mobile-cloud-asset.error',
    errorCode: code,
    retryable: error.kind !== 'config' && error.kind !== 'auth',
    details: {
      kind: error.kind,
      httpStatus: error.status,
      upstreamCode: error.upstreamCode,
      upstreamMessage: error.message,
      missing: error.missing.length > 0 ? error.missing : undefined,
    },
  })

  return NextResponse.json({
    success: false,
    error: {
      code,
      message: error.kind === 'config' ? '移动云素材资产接口尚未配置' : '移动云素材资产接口暂时不可用',
      retryable: error.kind !== 'config' && error.kind !== 'auth',
    },
    ...(error.kind === 'config' ? { diagnostics: { missing: error.missing } } : {}),
    // Include diagnostic details for non-config errors so the client can
    // surface actionable information (e.g. upstream error message, HTTP
    // status, error kind) instead of a generic "unavailable" message.
    ...(error.kind !== 'config' ? {
      diagnostics: {
        kind: error.kind,
        ...(error.status ? { httpStatus: error.status } : {}),
        ...(error.upstreamCode ? { upstreamCode: error.upstreamCode } : {}),
        ...(error.message && error.message !== code ? { upstreamMessage: error.message } : {}),
      },
    } : {}),
  }, { status })
}

export const GET = apiHandler(async (request: NextRequest) => {
  const auth = await requireUserAuth()
  if (isErrorResponse(auth)) return auth
  const params = request.nextUrl.searchParams
  const resource = params.get('resource')
  const pageNo = positiveInteger(params.get('pageNo'), 1)
  const pageSize = Math.min(100, positiveInteger(params.get('pageSize'), 50))

  try {
    if (resource === 'groups') {
      const groupType = params.get('groupType')
      const data = await mobileCloudMaasAssetClient.listGroups({
        pageNo,
        pageSize,
        ...(groupType ? { groupType: requireEnum(groupType, GROUP_TYPES) } : {}),
        ...(params.get('groupName') ? { groupName: text(params.get('groupName'), 100) } : {}),
        ...(parseIdList(params.get('groupIds')) ? { groupIds: parseIdList(params.get('groupIds')) } : {}),
      })
      return NextResponse.json({ success: true, data })
    }
    if (resource === 'assets') {
      // The upstream asset query requires the group type even when groupIds
      // are supplied. Validate it locally so a malformed UI request is not
      // sent as a misleading upstream availability failure.
      const groupType = requireEnum(params.get('groupType'), GROUP_TYPES)
      const statuses = params.get('statuses')?.split(',').map((item) => item.trim()).filter(Boolean)
      const data = await mobileCloudMaasAssetClient.listAssets({
        pageNo,
        pageSize,
        groupType,
        ...(params.get('groupIds') ? { groupIds: parseIdList(params.get('groupIds')) } : {}),
        ...(params.get('assetName') ? { assetName: text(params.get('assetName'), 100) } : {}),
        ...(statuses?.length ? { statuses: statuses.map((item) => requireEnum(item, ASSET_STATUSES)) } : {}),
      })
      return NextResponse.json({ success: true, data })
    }
    throw new ApiError('INVALID_PARAMS')
  } catch (error) {
    if (error instanceof MobileCloudMaasOpenApiError) return errorResponse(error)
    throw error
  }
})

export const POST = apiHandler(async (request: NextRequest) => {
  const auth = await requireUserAuth()
  if (isErrorResponse(auth)) return auth
  const body = await request.json() as Record<string, unknown>
  const resource = text(body.resource, 40)

  try {
    if (resource === 'group') {
      // LivenessFace 资产组只能由真人认证会话创建。
      if (body.groupType !== 'AIGC') throw new ApiError('INVALID_PARAMS')
      const data = await mobileCloudMaasAssetClient.createGroup({
        groupType: 'AIGC',
        groupName: text(body.groupName, 64),
        ...(optionalText(body.description, 300) ? { description: optionalText(body.description, 300) } : {}),
      })
      return NextResponse.json({ success: true, data }, { status: 201 })
    }
    if (resource === 'asset') {
      const data = await mobileCloudMaasAssetClient.createAsset({
        groupId: text(body.groupId, 200),
        assetName: text(body.assetName, 64),
        assetUrl: requireHttpUrl(body.assetUrl),
        assetType: requireEnum(body.assetType, ASSET_TYPES),
      })
      return NextResponse.json({ success: true, data }, { status: 201 })
    }
    if (resource === 'storyboard-panel-assets') {
      const projectId = text(body.projectId, 200)
      const episodeId = text(body.episodeId, 200)
      const groupId = text(body.groupId, 200)
      const panelIds = requireIdList(body.panelIds, MAX_STORYBOARD_PANEL_ASSETS_PER_REQUEST)

      // Material registration is scoped to a single project and episode. Do
      // not rely on client-supplied panel IDs for access control.
      const projectAuth = await requireProjectAuthLight(projectId)
      if (isErrorResponse(projectAuth)) return projectAuth
      await requireNovelPromotionEpisodeInProject(projectId, episodeId)

      const episode = await prisma.novelPromotionEpisode.findUnique({
        where: { id: episodeId },
        select: { name: true, episodeNumber: true },
      })
      if (!episode) throw new ApiError('NOT_FOUND')

      const panels = await prisma.novelPromotionPanel.findMany({
        where: {
          id: { in: panelIds },
          imageUrl: { not: null },
          storyboard: {
            episodeId,
            episode: { novelPromotionProject: { projectId } },
          },
        },
        select: {
          id: true,
          panelIndex: true,
          panelNumber: true,
          imageUrl: true,
          mobileCloudAssetId: true,
          mobileCloudAssetSourceUrl: true,
          mobileCloudAssetGroupId: true,
          mobileCloudAssetStatus: true,
        },
      })
      if (panels.length !== panelIds.length) throw new ApiError('NOT_FOUND')

      const byId = new Map(panels.map((panel) => [panel.id, panel]))
      const uploaded: Array<{
        panelId: string
        assetId: string
        status: MobileCloudAssetStatus
        reused: boolean
      }> = []
      for (const panelId of panelIds) {
        const panel = byId.get(panelId)
        if (!panel?.imageUrl) throw new ApiError('NOT_FOUND')

        // Repeat clicks and later bulk uploads commonly include an already
        // registered panel. Reuse it when the source image and target group
        // are unchanged so we do not create another remote material with the
        // same name.
        const existingAssetId = panel.mobileCloudAssetId?.trim() || ''
        const canReuseExistingAsset = !!existingAssetId
          && panel.mobileCloudAssetSourceUrl === panel.imageUrl
          && panel.mobileCloudAssetGroupId === groupId
          && panel.mobileCloudAssetStatus !== 'FAILED'
        if (canReuseExistingAsset) {
          uploaded.push({
            panelId: panel.id,
            assetId: existingAssetId,
            status: storedAssetStatus(panel.mobileCloudAssetStatus),
            reused: true,
          })
          continue
        }

        const assetUrl = await normalizeToOriginalMediaUrl(panel.imageUrl, {
          absoluteBaseUrl: getPublicBaseUrl(),
        })
        const created = await mobileCloudMaasAssetClient.createAsset({
          groupId,
          assetName: panelAssetName({
            episodeName: episode.name,
            episodeNumber: episode.episodeNumber,
            panelIndex: panel.panelIndex,
            panelNumber: panel.panelNumber,
            panelId: panel.id,
            sourceImageUrl: panel.imageUrl,
            ...(panel.mobileCloudAssetStatus === 'FAILED'
              ? { retryAssetId: panel.mobileCloudAssetId }
              : {}),
          }),
          assetUrl: requireHttpUrl(assetUrl),
          assetType: 'Image',
        })

        await prisma.novelPromotionPanel.update({
          where: { id: panel.id },
          data: {
            mobileCloudAssetId: created.assetId,
            mobileCloudAssetSourceUrl: panel.imageUrl,
            mobileCloudAssetGroupId: groupId,
            mobileCloudAssetStatus: 'PROCESSING',
            mobileCloudAssetSyncedAt: new Date(),
          },
        })
        uploaded.push({ panelId: panel.id, assetId: created.assetId, status: 'PROCESSING', reused: false })
      }

      return NextResponse.json({ success: true, data: { uploaded } }, { status: 201 })
    }
    if (resource === 'real-person-session') {
      const data = await mobileCloudMaasAssetClient.createRealPersonAuthSession()
      return NextResponse.json({ success: true, data })
    }
    if (resource === 'real-person-group') {
      const data = await mobileCloudMaasAssetClient.findGroupByBytedToken(text(body.bytedToken, 512))
      return NextResponse.json({ success: true, data })
    }
    throw new ApiError('INVALID_PARAMS')
  } catch (error) {
    if (error instanceof MobileCloudMaasOpenApiError) return errorResponse(error)
    throw error
  }
})

export const PUT = apiHandler(async (request: NextRequest) => {
  const auth = await requireUserAuth()
  if (isErrorResponse(auth)) return auth
  const body = await request.json() as Record<string, unknown>
  const resource = text(body.resource, 40)
  const id = text(body.id, 200)

  try {
    if (resource === 'group') {
      const groupName = optionalText(body.groupName, 64)
      const description = optionalText(body.description, 300)
      if (!groupName && !description) throw new ApiError('INVALID_PARAMS')
      const data = await mobileCloudMaasAssetClient.updateGroup(id, {
        ...(groupName ? { groupName } : {}),
        ...(description ? { description } : {}),
      })
      return NextResponse.json({ success: true, data })
    }
    if (resource === 'asset') {
      const assetName = optionalText(body.assetName, 64)
      if (!assetName) throw new ApiError('INVALID_PARAMS')
      const data = await mobileCloudMaasAssetClient.updateAsset(id, { assetName })
      return NextResponse.json({ success: true, data })
    }
    throw new ApiError('INVALID_PARAMS')
  } catch (error) {
    if (error instanceof MobileCloudMaasOpenApiError) return errorResponse(error)
    throw error
  }
})

export const DELETE = apiHandler(async (request: NextRequest) => {
  const auth = await requireUserAuth()
  if (isErrorResponse(auth)) return auth
  const body = await request.json() as Record<string, unknown>
  const resource = text(body.resource, 40)
  const id = text(body.id, 200)

  try {
    if (resource === 'group') await mobileCloudMaasAssetClient.deleteGroup(id)
    else if (resource === 'asset') await mobileCloudMaasAssetClient.deleteAsset(id)
    else throw new ApiError('INVALID_PARAMS')
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof MobileCloudMaasOpenApiError) return errorResponse(error)
    throw error
  }
})
