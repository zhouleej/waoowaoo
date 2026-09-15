import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { resolveFfmpegExecutable } from '@/lib/media/ffmpeg-runtime'

const AUDIO_NORMALIZATION_TIMEOUT_MS = 60_000
const MAX_INPUT_BYTES = 30 * 1024 * 1024
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024
const MAX_ERROR_BYTES = 16 * 1024

interface WavFormatInfo {
  audioFormat: number
  channels: number
  sampleRate: number
  bitsPerSample: number
  hasAudioData: boolean
}

function readWavFormatInfo(buffer: Buffer): WavFormatInfo | null {
  if (buffer.length < 44
    || buffer.subarray(0, 4).toString('ascii') !== 'RIFF'
    || buffer.subarray(8, 12).toString('ascii') !== 'WAVE') {
    return null
  }

  let offset = 12
  let format: Omit<WavFormatInfo, 'hasAudioData'> | null = null
  let hasAudioData = false
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.subarray(offset, offset + 4).toString('ascii')
    const chunkSize = buffer.readUInt32LE(offset + 4)
    const chunkStart = offset + 8
    const chunkEnd = chunkStart + chunkSize
    if (chunkEnd > buffer.length) return null
    if (chunkId === 'fmt ') {
      if (chunkSize < 16) return null
      format = {
        audioFormat: buffer.readUInt16LE(chunkStart),
        channels: buffer.readUInt16LE(chunkStart + 2),
        sampleRate: buffer.readUInt32LE(chunkStart + 4),
        bitsPerSample: buffer.readUInt16LE(chunkStart + 14),
      }
    } else if (chunkId === 'data') {
      hasAudioData = chunkSize > 0
    }
    offset = chunkEnd + (chunkSize % 2)
  }
  return format ? { ...format, hasAudioData } : null
}

export function isWavAudioBuffer(buffer: Buffer): boolean {
  const info = readWavFormatInfo(buffer)
  return info !== null && info.hasAudioData
}

function isCanonicalPcmWav(buffer: Buffer): boolean {
  const info = readWavFormatInfo(buffer)
  return info?.hasAudioData === true
    && info.audioFormat === 1
    && info.channels === 1
    && info.sampleRate === 16000
    && info.bitsPerSample === 16
}

async function runFfmpeg(inputPath: string, outputPath: string): Promise<void> {
  const executable = await resolveFfmpegExecutable()
  const args = [
    '-hide_banner',
    '-loglevel', 'error',
    '-nostdin',
    '-y',
    '-i', inputPath,
    '-map', '0:a:0',
    '-vn',
    '-ac', '1',
    '-ar', '16000',
    '-c:a', 'pcm_s16le',
    outputPath,
  ]

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
      finish(new Error('AUDIO_NORMALIZATION_TIMEOUT'))
    }, AUDIO_NORMALIZATION_TIMEOUT_MS)

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
        finish(new Error(details
          ? `AUDIO_NORMALIZATION_FAILED: ${details}`
          : 'AUDIO_NORMALIZATION_FAILED'))
        return
      }
      finish()
    })
  })
}

/**
 * Keep verified WAV bytes unchanged. Other provider-supported containers such as
 * MP3 and AAC are converted to a real mono, 16 kHz, 16-bit PCM WAV file.
 */
export async function normalizeAudioToWav(buffer: Buffer): Promise<Buffer> {
  if (buffer.length === 0) {
    throw new Error('AUDIO_NORMALIZATION_INPUT_EMPTY')
  }
  if (buffer.length > MAX_INPUT_BYTES) {
    throw new Error('AUDIO_NORMALIZATION_INPUT_TOO_LARGE')
  }
  if (isCanonicalPcmWav(buffer)) return buffer

  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'wakuwaku-audio-'))
  const inputPath = path.join(temporaryDirectory, 'source-audio.bin')
  const outputPath = path.join(temporaryDirectory, 'normalized-audio.wav')
  try {
    await writeFile(inputPath, buffer, { flag: 'wx' })
    await runFfmpeg(inputPath, outputPath)
    const outputStats = await stat(outputPath)
    if (outputStats.size <= 0) {
      throw new Error('AUDIO_NORMALIZATION_OUTPUT_EMPTY')
    }
    if (outputStats.size > MAX_OUTPUT_BYTES) {
      throw new Error('AUDIO_NORMALIZATION_OUTPUT_TOO_LARGE')
    }
    const normalized = await readFile(outputPath)
    if (!isWavAudioBuffer(normalized)) {
      throw new Error('AUDIO_NORMALIZATION_WAV_INVALID')
    }
    return normalized
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true })
  }
}
