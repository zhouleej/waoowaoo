import path from 'node:path'
import { NextRequest } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { getObjectBuffer } from '@/lib/storage'
import { verifyStorageProxySignature } from '@/lib/storage/proxy-url'

export const runtime = 'nodejs'

const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
}

type ByteRange = { start: number; end: number }

function parseByteRange(value: string | null, size: number): ByteRange | null | 'invalid' {
  if (!value) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim())
  if (!match || (!match[1] && !match[2]) || size <= 0) return 'invalid'

  if (!match[1]) {
    const suffixLength = Number(match[2])
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return 'invalid'
    return { start: Math.max(0, size - suffixLength), end: size - 1 }
  }

  const start = Number(match[1])
  const requestedEnd = match[2] ? Number(match[2]) : size - 1
  if (
    !Number.isSafeInteger(start)
    || !Number.isSafeInteger(requestedEnd)
    || start < 0
    || start >= size
    || requestedEnd < start
  ) {
    return 'invalid'
  }
  return { start, end: Math.min(requestedEnd, size - 1) }
}

export const GET = apiHandler(async (request: NextRequest) => {
  const key = request.nextUrl.searchParams.get('key') || ''
  const expires = Number(request.nextUrl.searchParams.get('expires'))
  const signature = request.nextUrl.searchParams.get('signature') || ''
  if (!verifyStorageProxySignature(key, expires, signature)) throw new ApiError('FORBIDDEN')

  const data = await getObjectBuffer(key)
  const range = parseByteRange(request.headers.get('range'), data.length)
  const contentType = MIME_BY_EXTENSION[path.extname(key).toLowerCase()] || 'application/octet-stream'
  const cacheSeconds = Math.max(0, expires - Math.floor(Date.now() / 1_000))

  if (range === 'invalid') {
    return new Response(null, {
      status: 416,
      headers: { 'Content-Range': `bytes */${data.length}` },
    })
  }

  const body = range ? data.subarray(range.start, range.end + 1) : data
  return new Response(new Uint8Array(body), {
    status: range ? 206 : 200,
    headers: {
      'Accept-Ranges': 'bytes',
      'Cache-Control': `private, max-age=${cacheSeconds}`,
      'Content-Length': String(body.length),
      'Content-Type': contentType,
      ...(range ? { 'Content-Range': `bytes ${range.start}-${range.end}/${data.length}` } : {}),
    },
  })
})
