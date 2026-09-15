export const GENERATED_VIDEO_THUMBNAIL_KIND = 'output_thumbnail'

type InspirationImageAsset = {
  kind: string
  storageKey: string
  originalName: string
}

export function selectInspirationVideoThumbnail<T extends InspirationImageAsset>(assets: T[]): T | null {
  return assets.find((asset) => asset.kind === 'primary_image')
    || assets.find((asset) => asset.kind === 'reference_image')
    || assets.find((asset) => asset.kind === GENERATED_VIDEO_THUMBNAIL_KIND)
    || null
}

export function shouldExtractInspirationVideoThumbnail(
  payload: Record<string, unknown> | null | undefined,
  assets: Array<Pick<InspirationImageAsset, 'kind'>>,
): boolean {
  if (payload?.generateThumbnailFromVideo !== true) return false
  return !assets.some((asset) => asset.kind === 'primary_image' || asset.kind === 'reference_image')
}
