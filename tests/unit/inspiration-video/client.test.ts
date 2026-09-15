import { describe, expect, it } from 'vitest'
import {
  createInspirationSubmissionId,
  validateInspirationVideoFiles,
} from '@/lib/inspiration-video/client'

function file(name: string, type: string, size: number): File {
  return { name, type, size } as File
}

describe('inspiration video client safeguards', () => {
  it('uses randomUUID when the browser supports it', () => {
    const cryptoSource = {
      randomUUID: () => '11111111-2222-4333-8444-555555555555',
      getRandomValues: () => { throw new Error('not needed') },
    } as unknown as Crypto

    expect(createInspirationSubmissionId(cryptoSource)).toBe('11111111-2222-4333-8444-555555555555')
  })

  it('creates a server-compatible submission ID without randomUUID', () => {
    const cryptoSource = {
      getRandomValues: (values: Uint8Array) => {
        values.fill(10)
        return values
      },
    } as unknown as Crypto

    const id = createInspirationSubmissionId(cryptoSource)
    expect(id).toBe(`iv_${'0a'.repeat(16)}`)
    expect(id).toMatch(/^[a-zA-Z0-9_-]{16,100}$/)
  })

  it('falls back to a valid submission ID when Web Crypto is unavailable', () => {
    const id = createInspirationSubmissionId(undefined)
    expect(id).toMatch(/^[a-zA-Z0-9_-]{16,100}$/)
  })

  it('rejects unsupported and oversized files before upload', () => {
    expect(validateInspirationVideoFiles({
      primaryImage: file('key.gif', 'image/gif', 1024),
      referenceImages: [],
      referenceAudios: [],
    })).toMatchObject({ code: 'imageType', fileName: 'key.gif' })

    expect(validateInspirationVideoFiles({
      primaryImage: file('key.png', 'image/png', 10 * 1024 * 1024 + 1),
      referenceImages: [],
      referenceAudios: [],
    })).toMatchObject({ code: 'imageSize', fileName: 'key.png' })

    expect(validateInspirationVideoFiles({
      primaryImage: null,
      referenceImages: [],
      referenceAudios: [file('reference.txt', 'text/plain', 1024)],
    })).toMatchObject({ code: 'audioType', fileName: 'reference.txt' })
  })

  it('rejects an oversized combined asset payload', () => {
    const issue = validateInspirationVideoFiles({
      primaryImage: null,
      referenceImages: [],
      referenceAudios: [
        file('one.mp3', 'audio/mpeg', 27 * 1024 * 1024),
        file('two.mp3', 'audio/mpeg', 27 * 1024 * 1024),
        file('three.mp3', 'audio/mpeg', 27 * 1024 * 1024),
      ],
    })

    expect(issue).toMatchObject({ code: 'totalSize', limitBytes: 80 * 1024 * 1024 })
  })

  it('accepts files that meet the shared server constraints', () => {
    expect(validateInspirationVideoFiles({
      primaryImage: file('key.webp', 'image/webp', 2 * 1024 * 1024),
      referenceImages: [file('style.jpg', 'image/jpeg', 1024)],
      referenceAudios: [file('sound.wav', 'audio/wav', 3 * 1024 * 1024)],
    })).toBeNull()
  })
})
