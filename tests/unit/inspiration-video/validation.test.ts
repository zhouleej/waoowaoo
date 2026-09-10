import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api-errors'
import {
  INSPIRATION_VIDEO_LIMITS,
  parseInspirationVideoDraft,
} from '@/lib/inspiration-video/validation'

function createBaseFormData(): FormData {
  const formData = new FormData()
  formData.set('prompt', 'A paper boat travels through a glowing city in the rain')
  formData.set('modelKey', 'maas-seedance::doubao-seedance-2.0')
  formData.set('aspectRatio', '16:9')
  formData.set('resolution', '720p')
  formData.set('duration', '5')
  formData.set('generateAudio', 'true')
  formData.set('primaryImage', new File(['image'], 'primary.png', { type: 'image/png' }))
  return formData
}

describe('inspiration video input validation', () => {
  it('accepts prompt, primary image, reference images, and reference audio', () => {
    const formData = createBaseFormData()
    formData.append('referenceImages', new File(['image'], 'style.webp', { type: 'image/webp' }))
    formData.append('referenceAudios', new File(['audio'], 'mood.mp3', { type: 'audio/mpeg' }))

    const parsed = parseInspirationVideoDraft(formData)

    expect(parsed).toEqual(expect.objectContaining({
      prompt: 'A paper boat travels through a glowing city in the rain',
      modelKey: 'maas-seedance::doubao-seedance-2.0',
      aspectRatio: '16:9',
      resolution: '720p',
      duration: 5,
      generateAudio: true,
    }))
    expect(parsed.referenceImages).toHaveLength(1)
    expect(parsed.referenceAudios).toHaveLength(1)
  })

  it('allows no primary image, with model support enforced by the route', () => {
    const formData = createBaseFormData()
    formData.delete('primaryImage')
    expect(parseInspirationVideoDraft(formData).primaryImage).toBeNull()
  })

  it('rejects an unsupported audio file type', () => {
    const formData = createBaseFormData()
    formData.append('referenceAudios', new File(['not audio'], 'notes.txt', { type: 'text/plain' }))
    expect(() => parseInspirationVideoDraft(formData)).toThrow(ApiError)
  })

  it('caps the reference audio count', () => {
    const formData = createBaseFormData()
    for (let index = 0; index < INSPIRATION_VIDEO_LIMITS.referenceImages; index += 1) {
      formData.append('referenceImages', new File(['image'], `reference-${index}.jpg`, { type: 'image/jpeg' }))
    }
    for (let index = 0; index < INSPIRATION_VIDEO_LIMITS.referenceAudios + 1; index += 1) {
      formData.append('referenceAudios', new File(['audio'], `reference-${index}.mp3`, { type: 'audio/mpeg' }))
    }
    expect(() => parseInspirationVideoDraft(formData)).toThrow(ApiError)
  })
})
