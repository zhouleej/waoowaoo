import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { getVideoMetadata } from '@remotion/renderer'
import { getObjectBuffer } from '@/lib/storage'
import { ensureMediaObjectFromStorageKey } from './service'

export async function inspectGeneratedVideo(storageKey: string) {
  const data = await getObjectBuffer(storageKey)
  const root = os.tmpdir()
  const directory = await mkdtemp(path.join(root, 'waoowaoo-video-'))
  try {
    const file = path.join(directory, 'video.mp4')
    await writeFile(file, data)
    const metadata = await getVideoMetadata(file)
    if (typeof metadata.durationInSeconds !== 'number' || !Number.isFinite(metadata.durationInSeconds) || metadata.durationInSeconds <= 0 || metadata.width <= 0 || metadata.height <= 0) {
      throw new Error('VIDEO_OUTPUT_INVALID')
    }
    const durationMs = Math.round(metadata.durationInSeconds * 1000)
    await ensureMediaObjectFromStorageKey(storageKey, { durationMs, width: metadata.width, height: metadata.height, sizeBytes: data.length, mimeType: 'video/mp4' })
    return { durationMs, width: metadata.width, height: metadata.height, fps: metadata.fps }
  } finally {
    if (path.dirname(directory) === path.resolve(root)) await rm(directory, { recursive: true, force: true })
  }
}
