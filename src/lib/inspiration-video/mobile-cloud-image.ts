import { ApiError } from '@/lib/api-errors'
import {
  MobileCloudMaasOpenApiError,
  mobileCloudMaasAssetClient,
} from '@/lib/mobile-cloud-maas/asset-client'
import type { MobileCloudAsset } from '@/lib/mobile-cloud-maas/asset-types'
import { SafeOutboundError, withSafeOutboundResponse } from '@/lib/security/safe-outbound-http'
import { INSPIRATION_VIDEO_LIMITS } from './limits'

const DOWNLOAD_TIMEOUT_MS = 30_000
const MAX_REDIRECTS = 3

export type LoadedMobileCloudImage = {
  assetId: string
  assetName: string
  body: Buffer
}

function invalidAsset(field: string, code: string, message: string): never {
  throw new ApiError('INVALID_PARAMS', { field, code, message })
}

async function readLimitedBody(response: Response, maxBytes: number, field: string): Promise<Buffer> {
  const declaredSize = Number(response.headers.get('content-length') || '0')
  if (Number.isFinite(declaredSize) && declaredSize > maxBytes) {
    invalidAsset(field, 'INSPIRATION_MOBILE_CLOUD_IMAGE_TOO_LARGE', '移动云图片超过 10 MB，请更换素材')
  }
  if (!response.body) {
    invalidAsset(field, 'INSPIRATION_MOBILE_CLOUD_IMAGE_EMPTY', '移动云图片内容为空，请更换素材')
  }

  const reader = response.body.getReader()
  const chunks: Buffer[] = []
  let totalBytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      totalBytes += value.byteLength
      if (totalBytes > maxBytes) {
        await reader.cancel()
        invalidAsset(field, 'INSPIRATION_MOBILE_CLOUD_IMAGE_TOO_LARGE', '移动云图片超过 10 MB，请更换素材')
      }
      chunks.push(Buffer.from(value))
    }
  } finally {
    reader.releaseLock()
  }

  if (totalBytes === 0) {
    invalidAsset(field, 'INSPIRATION_MOBILE_CLOUD_IMAGE_EMPTY', '移动云图片内容为空，请更换素材')
  }
  return Buffer.concat(chunks, totalBytes)
}

async function fetchAssetBody(assetUrl: string, field: string): Promise<Buffer> {
  let currentUrl: URL
  try {
    currentUrl = new URL(assetUrl)
  } catch {
    invalidAsset(field, 'INSPIRATION_MOBILE_CLOUD_IMAGE_URL_INVALID', '移动云图片地址无效，请更换素材')
  }

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    let result: { body: Buffer; redirectUrl?: never } | { body?: never; redirectUrl: URL }
    try {
      result = await withSafeOutboundResponse(
        currentUrl,
        {
          method: 'GET',
          signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
        },
        async (response) => {
          if (response.status >= 300 && response.status < 400) {
            const location = response.headers.get('location')
            if (!location || redirectCount === MAX_REDIRECTS) {
              throw new ApiError('EXTERNAL_ERROR', {
                field,
                code: 'INSPIRATION_MOBILE_CLOUD_IMAGE_REDIRECT_INVALID',
                message: '移动云图片地址跳转异常，请更换素材',
              })
            }
            return { redirectUrl: new URL(location, currentUrl) }
          }
          if (!response.ok) {
            throw new ApiError('EXTERNAL_ERROR', {
              field,
              code: 'INSPIRATION_MOBILE_CLOUD_IMAGE_DOWNLOAD_FAILED',
              upstreamStatus: response.status,
              message: '移动云图片下载失败，请稍后重试',
            })
          }
          return {
            body: await readLimitedBody(response, INSPIRATION_VIDEO_LIMITS.imageBytes, field),
          }
        },
      )
    } catch (error) {
      if (error instanceof ApiError) throw error
      const code = error instanceof SafeOutboundError && error.code === 'SSRF_BLOCKED'
        ? 'INSPIRATION_MOBILE_CLOUD_IMAGE_URL_BLOCKED'
        : 'INSPIRATION_MOBILE_CLOUD_IMAGE_DOWNLOAD_FAILED'
      throw new ApiError('EXTERNAL_ERROR', {
        field,
        code,
        message: code.endsWith('BLOCKED')
          ? '移动云图片地址未通过安全校验，请更换素材'
          : '移动云图片下载失败，请稍后重试',
      })
    }

    if (result.redirectUrl) {
      currentUrl = result.redirectUrl
      continue
    }
    return result.body
  }

  throw new ApiError('EXTERNAL_ERROR', {
    field,
    code: 'INSPIRATION_MOBILE_CLOUD_IMAGE_DOWNLOAD_FAILED',
    message: '移动云图片下载失败，请稍后重试',
  })
}

function validateAsset(asset: MobileCloudAsset, expectedAssetId: string, field: string): void {
  if (asset.assetId !== expectedAssetId || asset.assetType !== 'Image') {
    invalidAsset(field, 'INSPIRATION_MOBILE_CLOUD_ASSET_NOT_IMAGE', '所选移动云素材不是图片，请重新选择')
  }
  if (asset.status !== 'ACTIVE') {
    invalidAsset(field, 'INSPIRATION_MOBILE_CLOUD_ASSET_NOT_READY', '所选移动云图片尚未就绪，请稍后重试')
  }
  if (!asset.assetUrl) {
    invalidAsset(field, 'INSPIRATION_MOBILE_CLOUD_IMAGE_URL_INVALID', '所选移动云图片没有可用地址，请更换素材')
  }
}

export async function loadMobileCloudImage(assetId: string, field: string): Promise<LoadedMobileCloudImage> {
  let asset: MobileCloudAsset
  try {
    asset = await mobileCloudMaasAssetClient.getAsset(assetId)
  } catch (error) {
    if (error instanceof MobileCloudMaasOpenApiError) {
      throw new ApiError('EXTERNAL_ERROR', {
        field,
        code: 'INSPIRATION_MOBILE_CLOUD_ASSET_LOOKUP_FAILED',
        message: error.kind === 'config'
          ? '移动云素材资产接口尚未配置'
          : '移动云素材读取失败，请稍后重试',
      })
    }
    throw error
  }

  validateAsset(asset, assetId, field)
  const body = await fetchAssetBody(asset.assetUrl, field)
  return {
    assetId,
    assetName: asset.assetName || `mobile-cloud-${assetId}`,
    body,
  }
}
