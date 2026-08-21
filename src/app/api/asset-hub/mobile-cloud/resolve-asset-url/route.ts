import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireUserAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { resolveMediaRefFromLegacyValue } from '@/lib/media/service'
import { getSignedObjectUrl } from '@/lib/storage'
import { decodeImageUrlsFromDb } from '@/lib/contracts/image-urls-contract'
import { PRIMARY_APPEARANCE_INDEX } from '@/lib/constants'
import {
  listGlobalLocationBackedAssets,
} from '@/lib/assets/services/location-backed-assets'

type AssetKind = 'character' | 'location' | 'prop'

const VALID_KINDS = new Set<AssetKind>(['character', 'location', 'prop'])

/**
 * GET /api/asset-hub/mobile-cloud/resolve-asset-url
 *
 * Resolves a local asset-hub visual asset (character / location / prop) to its
 * signed OSS/COS URL so the image can be used as the `assetUrl` when creating a
 * Mobile Cloud material asset.
 *
 * Query params:
 * - kind: 'character' | 'location' | 'prop'
 * - assetId: the global asset id
 */
export const GET = apiHandler(async (request: NextRequest) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  const { searchParams } = new URL(request.url)
  const kind = searchParams.get('kind')
  const assetId = searchParams.get('assetId')

  if (!kind || !VALID_KINDS.has(kind as AssetKind)) {
    throw new ApiError('INVALID_PARAMS', { details: 'kind must be character, location, or prop' })
  }
  if (!assetId || assetId.length > 200) {
    throw new ApiError('INVALID_PARAMS', { details: 'assetId is required' })
  }

  const userId = session.user.id
  const resolvedKind = kind as AssetKind

  if (resolvedKind === 'character') {
    const character = await prisma.globalCharacter.findFirst({
      where: { id: assetId, userId },
      include: {
        appearances: {
          orderBy: { appearanceIndex: 'asc' },
        },
      },
    })
    if (!character) throw new ApiError('NOT_FOUND')

    const primaryAppearance = character.appearances.find((a) => a.appearanceIndex === PRIMARY_APPEARANCE_INDEX)
      || character.appearances[0]
      || null

    const storageKey = await extractCharacterImageStorageKey(primaryAppearance)
    const signedUrl = await resolveToSignedUrl(storageKey)
    if (!signedUrl) throw new ApiError('NO_RESULT', { details: 'asset image is not available' })

    return NextResponse.json({
      success: true,
      data: { assetName: character.name, signedUrl },
    })
  }

  // location or prop — both are backed by GlobalLocation
  const assets = await listGlobalLocationBackedAssets({ userId, kind: resolvedKind })
  const asset = assets.find((item) => {
    const record = item as unknown as { id: string }
    return record.id === assetId
  })
  if (!asset) throw new ApiError('NOT_FOUND')

  const storageKey = await extractLocationImageStorageKey(asset)
  const signedUrl = await resolveToSignedUrl(storageKey)
  if (!signedUrl) throw new ApiError('NO_RESULT', { details: 'asset image is not available' })

  const name = (asset as unknown as { name: string }).name
  return NextResponse.json({
    success: true,
    data: { assetName: name, signedUrl },
  })
})

async function extractCharacterImageStorageKey(
  appearance: {
    imageUrls: string | null
    selectedIndex: number | null
    imageUrl: string | null
  } | null,
): Promise<string | null> {
  if (!appearance) return null

  const urls = decodeImageUrlsFromDb(appearance.imageUrls, 'globalCharacterAppearance.imageUrls')
  const selectedUrl = urls[appearance.selectedIndex ?? 0] || urls[0] || appearance.imageUrl
  if (!selectedUrl) return null

  const media = await resolveMediaRefFromLegacyValue(selectedUrl)
  return media?.storageKey ?? null
}

async function extractLocationImageStorageKey(
  asset: unknown,
): Promise<string | null> {
  const record = asset as { images?: Array<{ imageUrl: string | null; isSelected?: boolean }> }
  const images = record.images ?? []
  const selectedImage = images.find((img) => img.isSelected) || images[0]
  if (!selectedImage?.imageUrl) return null

  const media = await resolveMediaRefFromLegacyValue(selectedImage.imageUrl)
  return media?.storageKey ?? null
}

async function resolveToSignedUrl(storageKey: string | null): Promise<string | null> {
  if (!storageKey) return null
  return getSignedObjectUrl(storageKey)
}
