import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { ALL_FORMATS, FilePathSource, Input } from 'mediabunny'
import { getObjectBuffer } from '@/lib/storage'
import { ensureMediaObjectFromStorageKey } from './service'

export async function inspectGeneratedVideo(storageKey: string) {
  const data = await getObjectBuffer(storageKey)
  const root = os.tmpdir()
  const directory = await mkdtemp(path.join(root, 'waoowaoo-video-'))
  try {
    const file = path.join(directory, 'video.mp4')
    await writeFile(file, data)
    const input = new Input({
      source: new FilePathSource(file),
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
      sizeBytes: data.length,
      mimeType: 'video/mp4',
    })
    return { durationMs, width, height, fps }
  } finally {
    if (path.dirname(directory) === path.resolve(root)) await rm(directory, { recursive: true, force: true })
  }
}
