import { spawn } from 'node:child_process'
import { Readable } from 'node:stream'
import sharp from 'sharp'
import { getObjectStream } from '@/lib/storage'

const MAX_FRAME_BYTES = 32 * 1024 * 1024
const MAX_ERROR_BYTES = 16 * 1024
const EXTRACTION_TIMEOUT_MS = 60_000

async function resolveFfmpegExecutable(): Promise<string> {
  const configured = process.env.FFMPEG_PATH?.trim()
  if (configured) return configured

  const { RenderInternals } = await import('@remotion/renderer')
  return RenderInternals.getExecutablePath({
    type: 'ffmpeg',
    indent: false,
    logLevel: 'error',
    binariesDirectory: process.env.REMOTION_BINARIES_DIRECTORY?.trim() || null,
  })
}

async function decodeFirstFrame(video: ReadableStream<Uint8Array>): Promise<Buffer> {
  const executable = await resolveFfmpegExecutable()
  const args = [
    '-hide_banner',
    '-loglevel', 'error',
    '-i', 'pipe:0',
    '-map', '0:v:0',
    '-frames:v', '1',
    '-an',
    '-sn',
    '-dn',
    '-f', 'image2pipe',
    '-c:v', 'mjpeg',
    'pipe:1',
  ]

  return await new Promise<Buffer>((resolve, reject) => {
    const child = spawn(executable, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })
    const output: Buffer[] = []
    const errors: Buffer[] = []
    const input = Readable.fromWeb(video as import('node:stream/web').ReadableStream)
    let outputBytes = 0
    let errorBytes = 0
    let settled = false
    const finish = (error?: Error, frame?: Buffer) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      input.destroy()
      if (error) reject(error)
      else resolve(frame || Buffer.alloc(0))
    }
    const timeout = setTimeout(() => {
      child.kill()
      finish(new Error('VIDEO_THUMBNAIL_EXTRACTION_TIMEOUT'))
    }, EXTRACTION_TIMEOUT_MS)

    child.stdout.on('data', (chunk: Buffer) => {
      outputBytes += chunk.length
      if (outputBytes > MAX_FRAME_BYTES) {
        child.kill()
        finish(new Error('VIDEO_THUMBNAIL_FRAME_TOO_LARGE'))
        return
      }
      output.push(chunk)
    })
    child.stderr.on('data', (chunk: Buffer) => {
      if (errorBytes >= MAX_ERROR_BYTES) return
      const remaining = MAX_ERROR_BYTES - errorBytes
      const next = chunk.subarray(0, remaining)
      errors.push(next)
      errorBytes += next.length
    })
    child.once('error', (error) => finish(error))
    child.once('close', (code) => {
      if (settled) return
      if (code !== 0) {
        const details = Buffer.concat(errors).toString('utf8').trim()
        finish(new Error(details ? `VIDEO_THUMBNAIL_EXTRACTION_FAILED: ${details}` : 'VIDEO_THUMBNAIL_EXTRACTION_FAILED'))
        return
      }
      const frame = Buffer.concat(output)
      if (frame.length === 0) {
        finish(new Error('VIDEO_THUMBNAIL_FRAME_EMPTY'))
        return
      }
      finish(undefined, frame)
    })
    child.stdin.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code !== 'EPIPE') finish(error)
    })
    input.once('error', (error) => finish(error))
    input.pipe(child.stdin)
  })
}

export async function extractStoredVideoFirstFrame(storageKey: string): Promise<Buffer> {
  const video = await getObjectStream(storageKey)
  const frame = await decodeFirstFrame(video.body)
  return await sharp(frame)
    .rotate()
    .resize({ width: 960, height: 960, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer()
}
