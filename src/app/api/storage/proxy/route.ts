import path from 'node:path'
import { NextRequest } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { getObjectMetadata, getObjectStream } from '@/lib/storage'
import { verifyStorageProxySignature, type StorageProxyDisposition } from '@/lib/storage/proxy-url'

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

function encodeRfc5987Value(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) => (
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  ))
}

function attachmentHeader(filename: string): string {
  const fallback = filename
    .replace(/[^\x20-\x7E]/g, '_')
    .replace(/["\\]/g, '_')
    .trim() || 'download'
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeRfc5987Value(filename)}`
}

async function serveObject(request: NextRequest, headOnly: boolean) {
  const key = request.nextUrl.searchParams.get('key') || ''
  const expires = Number(request.nextUrl.searchParams.get('expires'))
  const signature = request.nextUrl.searchParams.get('signature') || ''
  const requestedDisposition = request.nextUrl.searchParams.get('disposition')
  const disposition: StorageProxyDisposition = requestedDisposition === 'attachment' ? 'attachment' : 'inline'
  const filename = disposition === 'attachment' ? request.nextUrl.searchParams.get('filename') || '' : ''
  if (!verifyStorageProxySignature(key, expires, signature, disposition, filename)) {
    throw new ApiError('FORBIDDEN')
  }

  const metadata = await getObjectMetadata(key)
  const range = parseByteRange(request.headers.get('range'), metadata.size)
  const contentType = MIME_BY_EXTENSION[path.extname(key).toLowerCase()]
    || metadata.contentType
    || 'application/octet-stream'
  const cacheSeconds = Math.max(0, expires - Math.floor(Date.now() / 1_000))

  if (range === 'invalid') {
    return new Response(null, {
      status: 416,
      headers: { 'Content-Range': `bytes */${metadata.size}` },
    })
  }

  const contentLength = range ? range.end - range.start + 1 : metadata.size
  const headers: Record<string, string> = {
    'Accept-Ranges': 'bytes',
    'Cache-Control': `private, max-age=${cacheSeconds}`,
    'Content-Length': String(contentLength),
    'Content-Type': contentType,
    'X-Content-Type-Options': 'nosniff',
    ...(range ? { 'Content-Range': `bytes ${range.start}-${range.end}/${metadata.size}` } : {}),
    ...(metadata.etag ? { ETag: metadata.etag } : {}),
    ...(metadata.lastModified ? { 'Last-Modified': metadata.lastModified.toUTCString() } : {}),
    ...(disposition === 'attachment' ? { 'Content-Disposition': attachmentHeader(filename) } : {}),
  }
  if (headOnly) {
    return new Response(null, {
      status: range ? 206 : 200,
      headers,
    })
  }

  const object = await getObjectStream(key, range || undefined)
  return new Response(object.body, {
    status: range ? 206 : 200,
    headers,
  })
}

export const GET = apiHandler(async (request: NextRequest) => serveObject(request, false))
export const HEAD = apiHandler(async (request: NextRequest) => serveObject(request, true))
