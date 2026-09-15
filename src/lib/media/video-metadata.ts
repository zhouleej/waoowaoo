import { ALL_FORMATS, Input, StreamSource } from 'mediabunny'
import { getObjectMetadata, getObjectStream } from '@/lib/storage'
import { ensureMediaObjectFromStorageKey } from './service'

const VIDEO_METADATA_CACHE_BYTES = 4 * 1024 * 1024

export async function inspectGeneratedVideo(storageKey: string) {
  const metadata = await getObjectMetadata(storageKey)
  const input = new Input({
    source: new StreamSource({
      getSize: () => metadata.size,
      read: async (start, end) => {
        if (end <= start) return new Uint8Array()
        const object = await getObjectStream(storageKey, { start, end: end - 1 })
        return object.body
      },
      maxCacheSize: VIDEO_METADATA_CACHE_BYTES,
      prefetchProfile: 'network',
    }),
    formats: ALL_FORMATS,
  })
  let durationInSeconds: number
  let width: number | undefined
  let height: number | undefined
  let fps: number | null = null
  try {
    durationInSeconds = await input.computeDuration()
    const videoTrack = await input.getPrimaryVideoTrack()
    width = videoTrack?.displayWidth
    height = videoTrack?.displayHeight
    if (videoTrack) {
      const packetStats = await videoTrack.computePacketStats(100)
      fps = packetStats.averagePacketRate
    }
  } finally {
    input.dispose()
  }
  if (
    typeof durationInSeconds !== 'number' ||
    !Number.isFinite(durationInSeconds) ||
    durationInSeconds <= 0 ||
    typeof width !== 'number' ||
    !Number.isFinite(width) ||
    width <= 0 ||
    typeof height !== 'number' ||
    !Number.isFinite(height) ||
    height <= 0
  ) {
    throw new Error('VIDEO_OUTPUT_INVALID')
  }
  const durationMs = Math.round(durationInSeconds * 1000)
  await ensureMediaObjectFromStorageKey(storageKey, {
    durationMs,
    width,
    height,
    sizeBytes: metadata.size,
    mimeType: 'video/mp4',
  })
  return { durationMs, width, height, fps }
}
