import { getSignedUrl, getStorageDownloadUrl, getStorageProxyUrl } from '@/lib/storage'

const INSPIRATION_MEDIA_TTL_SECONDS = 7_200

export type InspirationVideoDeliveryUrls = {
  videoUrl: string
  videoFallbackUrl: string
  downloadUrl: string
}

/**
 * Playback follows the same delivery path as completed storyboard videos:
 * the application signs the request, then MinIO serves the media directly.
 * The same-origin proxy remains available as a compatibility fallback for a
 * temporarily unavailable or incorrectly configured public MinIO endpoint.
 */
export function buildInspirationVideoDeliveryUrls(
  storageKey: string,
  downloadFilename: string,
): InspirationVideoDeliveryUrls {
  return {
    videoUrl: getSignedUrl(storageKey, INSPIRATION_MEDIA_TTL_SECONDS),
    videoFallbackUrl: getStorageProxyUrl(storageKey, INSPIRATION_MEDIA_TTL_SECONDS),
    downloadUrl: getStorageDownloadUrl(
      storageKey,
      downloadFilename,
      INSPIRATION_MEDIA_TTL_SECONDS,
    ),
  }
}
