import { createReadStream, createWriteStream } from 'node:fs'
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import {
  generateUniqueKey,
  getObjectStream,
  toFetchableUrl,
  uploadObjectStream,
} from '@/lib/storage'
import { resolveFfmpegExecutable } from '@/lib/media/ffmpeg-runtime'

const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024
const MAX_AUDIO_BYTES = 64 * 1024 * 1024
const MAX_ERROR_BYTES = 16 * 1024
const DOWNLOAD_TIMEOUT_MS = 10 * 60_000
const MUX_TIMEOUT_MS = 10 * 60_000

interface MuxVideoWithAudioOptions {
  videoSource: string | Buffer
  audioSource: string | Buffer | Array<string | Buffer>
  durationMs: number
  keyPrefix: string
  targetId: string
  videoHeaders?: Record<string, string>
}

function sizeGuard(maxBytes: number, errorCode: string): Transform {
  let receivedBytes = 0
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      receivedBytes += chunk.length
      if (receivedBytes > maxBytes) {
        callback(new Error(errorCode))
        return
      }
      callback(null, chunk)
    },
  })
}

function isDirectStorageKey(value: string): boolean {
  return !value.startsWith('/')
    && !value.startsWith('data:')
    && !value.startsWith('http://')
    && !value.startsWith('https://')
}

function decodeDataUrl(value: string): Buffer {
  const marker = ';base64,'
  const markerIndex = value.indexOf(marker)
  if (markerIndex < 0) throw new Error('MEDIA_MUX_DATA_URL_INVALID')
  const decoded = Buffer.from(value.slice(markerIndex + marker.length), 'base64')
  if (decoded.length === 0) throw new Error('MEDIA_MUX_DATA_URL_EMPTY')
  return decoded
}

async function writeBoundedBuffer(
  buffer: Buffer,
  outputPath: string,
  maxBytes: number,
  tooLargeCode: string,
): Promise<void> {
  if (buffer.length === 0) throw new Error('MEDIA_MUX_INPUT_EMPTY')
  if (buffer.length > maxBytes) throw new Error(tooLargeCode)
  await writeFile(outputPath, buffer, { flag: 'wx' })
}

async function materializeMediaSource(
  source: string | Buffer,
  outputPath: string,
  maxBytes: number,
  tooLargeCode: string,
  headers?: Record<string, string>,
): Promise<void> {
  if (Buffer.isBuffer(source)) {
    await writeBoundedBuffer(source, outputPath, maxBytes, tooLargeCode)
    return
  }

  if (source.startsWith('data:')) {
    await writeBoundedBuffer(decodeDataUrl(source), outputPath, maxBytes, tooLargeCode)
    return
  }

  if (isDirectStorageKey(source)) {
    const stored = await getObjectStream(source)
    if (stored.contentLength <= 0) throw new Error('MEDIA_MUX_INPUT_EMPTY')
    if (stored.contentLength > maxBytes) throw new Error(tooLargeCode)
    const input = Readable.fromWeb(stored.body as import('node:stream/web').ReadableStream<Uint8Array>)
    await pipeline(input, sizeGuard(maxBytes, tooLargeCode), createWriteStream(outputPath, { flags: 'wx' }))
    return
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS)
  try {
    const response = await fetch(toFetchableUrl(source), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; WakuwakuMediaMux/1.0)',
        ...(headers || {}),
      },
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(`MEDIA_MUX_DOWNLOAD_FAILED: ${response.status} ${response.statusText}`)
    }
    if (!response.body) throw new Error('MEDIA_MUX_DOWNLOAD_EMPTY')
    const declaredLength = Number(response.headers.get('content-length'))
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) throw new Error(tooLargeCode)
    const input = Readable.fromWeb(
      response.body as import('node:stream/web').ReadableStream<Uint8Array>,
    )
    await pipeline(input, sizeGuard(maxBytes, tooLargeCode), createWriteStream(outputPath, { flags: 'wx' }))
  } finally {
    clearTimeout(timeout)
  }
}

export function buildVideoAudioMuxArgs(
  videoPath: string,
  audioPath: string | string[],
  outputPath: string,
  durationMs: number,
): string[] {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    throw new Error('VIDEO_AUDIO_MUX_DURATION_INVALID')
  }
  const durationSeconds = (durationMs / 1000).toFixed(3)
  const audioPaths = Array.isArray(audioPath) ? audioPath : [audioPath]
  if (audioPaths.length === 0) throw new Error('VIDEO_AUDIO_MUX_AUDIO_REQUIRED')
  const args = [
    '-hide_banner',
    '-loglevel', 'error',
    '-nostdin',
    '-y',
    '-i', videoPath,
  ]
  for (const path of audioPaths) args.push('-i', path)
  args.push(
    '-map', '0:v:0',
  )
  if (audioPaths.length === 1) {
    args.push('-map', '1:a:0')
  } else {
    const inputs = audioPaths.map((_, index) => `[${index + 1}:a:0]`).join('')
    args.push(
      '-filter_complex', `${inputs}concat=n=${audioPaths.length}:v=0:a=1,apad[dialogue]`,
      '-map', '[dialogue]',
    )
  }
  args.push(
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-b:a', '192k',
  )
  if (audioPaths.length === 1) {
    args.push('-af', 'apad')
  }
  args.push(
    // apad keeps the video duration intact when speech ends early. The explicit
    // output duration also prevents an infinite padded stream on older ffmpeg.
    '-t', durationSeconds,
    '-movflags', '+faststart',
    '-f', 'mp4',
    outputPath,
  )
  return args
}

async function runMux(
  videoPath: string,
  audioPath: string | string[],
  outputPath: string,
  durationMs: number,
): Promise<void> {
  const executable = await resolveFfmpegExecutable()
  const args = buildVideoAudioMuxArgs(videoPath, audioPath, outputPath, durationMs)

  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, args, {
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true,
    })
    const errors: Buffer[] = []
    let errorBytes = 0
    let settled = false
    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      if (error) reject(error)
      else resolve()
    }
    const timeout = setTimeout(() => {
      child.kill()
      finish(new Error('VIDEO_AUDIO_MUX_TIMEOUT'))
    }, MUX_TIMEOUT_MS)

    child.stderr.on('data', (chunk: Buffer) => {
      if (errorBytes >= MAX_ERROR_BYTES) return
      const next = chunk.subarray(0, MAX_ERROR_BYTES - errorBytes)
      errors.push(next)
      errorBytes += next.length
    })
    child.once('error', (error) => finish(error))
    child.once('close', (code) => {
      if (settled) return
      if (code !== 0) {
        const details = Buffer.concat(errors).toString('utf8').trim()
        finish(new Error(details ? `VIDEO_AUDIO_MUX_FAILED: ${details}` : 'VIDEO_AUDIO_MUX_FAILED'))
        return
      }
      finish()
    })
  })
}

/**
 * Lip-sync providers are not required to preserve the submitted audio in their
 * result video. Store a deterministic MP4 with the authoritative dialogue audio
 * so panel preview/download never depends on provider-specific audio behavior.
 */
export async function muxVideoWithAudioToStorage(
  options: MuxVideoWithAudioOptions,
): Promise<string> {
  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'wakuwaku-video-audio-mux-'))
  const videoPath = path.join(temporaryDirectory, 'lip-sync-video.bin')
  const audioSources = Array.isArray(options.audioSource) ? options.audioSource : [options.audioSource]
  if (audioSources.length === 0) throw new Error('VIDEO_AUDIO_MUX_AUDIO_REQUIRED')
  const audioPaths = audioSources.map((_, index) => path.join(temporaryDirectory, `dialogue-audio-${index}.bin`))
  const outputPath = path.join(temporaryDirectory, 'lip-sync-with-dialogue.mp4')
  try {
    await Promise.all([
      materializeMediaSource(
        options.videoSource,
        videoPath,
        MAX_VIDEO_BYTES,
        'VIDEO_AUDIO_MUX_VIDEO_TOO_LARGE',
        options.videoHeaders,
      ),
      ...audioSources.map((source, index) => materializeMediaSource(
        source,
        audioPaths[index],
        MAX_AUDIO_BYTES,
        'VIDEO_AUDIO_MUX_AUDIO_TOO_LARGE',
      )),
    ])
    await runMux(videoPath, audioPaths, outputPath, options.durationMs)
    const outputStats = await stat(outputPath)
    if (outputStats.size <= 0) throw new Error('VIDEO_AUDIO_MUX_OUTPUT_EMPTY')
    if (outputStats.size > MAX_VIDEO_BYTES) throw new Error('VIDEO_AUDIO_MUX_OUTPUT_TOO_LARGE')

    const key = generateUniqueKey(`${options.keyPrefix}-${options.targetId}`, 'mp4')
    return await uploadObjectStream(
      createReadStream(outputPath),
      key,
      outputStats.size,
      'video/mp4',
    )
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true })
  }
}
