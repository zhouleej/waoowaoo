import { describe, expect, it } from 'vitest'
import {
  selectInspirationVideoThumbnail,
  shouldExtractInspirationVideoThumbnail,
} from '@/lib/inspiration-video/thumbnail'

const asset = (kind: string, storageKey = `${kind}.jpg`) => ({
  kind,
  storageKey,
  originalName: `${kind}.jpg`,
})

describe('inspiration video thumbnail policy', () => {
  it('prefers the main image, then a reference image, then a generated first frame', () => {
    const generated = asset('output_thumbnail')
    const reference = asset('reference_image')
    const primary = asset('primary_image')

    expect(selectInspirationVideoThumbnail([generated, reference, primary])).toBe(primary)
    expect(selectInspirationVideoThumbnail([generated, reference])).toBe(reference)
    expect(selectInspirationVideoThumbnail([generated])).toBe(generated)
  })

  it('extracts a first frame only when a new task explicitly requests it and has no image', () => {
    const enabled = { generateThumbnailFromVideo: true }

    expect(shouldExtractInspirationVideoThumbnail(enabled, [])).toBe(true)
    expect(shouldExtractInspirationVideoThumbnail(enabled, [asset('primary_image')])).toBe(false)
    expect(shouldExtractInspirationVideoThumbnail(enabled, [asset('reference_image')])).toBe(false)
    expect(shouldExtractInspirationVideoThumbnail({}, [])).toBe(false)
    expect(shouldExtractInspirationVideoThumbnail(undefined, [])).toBe(false)
  })
})
