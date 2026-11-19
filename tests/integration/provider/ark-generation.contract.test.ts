import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { VideoGenerateParams } from '@/lib/generators/base'

const media = vi.hoisted(() => ({
  base64: vi.fn(async (url: string) => `data:image/png;base64,${Buffer.from(url).toString('base64')}`),
  original: vi.fn(async (url: string) => url.startsWith('/api/') ? 'https://storage.example.com/reference.mp3' : url),
}))
vi.mock('@/lib/api-config', () => ({
  getProviderConfig: vi.fn(async () => ({ id: 'ark', apiKey: 'ark-test-key' })),
}))
vi.mock('@/lib/media/outbound-image', () => ({
  normalizeToBase64ForGeneration: media.base64,
  normalizeToOriginalMediaUrl: media.original,
}))
vi.mock('@/lib/logging/core', () => ({ logInfo: vi.fn(), logError: vi.fn(), logWarn: vi.fn() }))

import { ArkVideoGenerator } from '@/lib/generators/ark'

class TestArkVideoGenerator extends ArkVideoGenerator {
  submit(params: VideoGenerateParams) { return this.doGenerate(params) }
}

describe('Ark video generation through the application adapter', () => {
  const fetchMock = vi.fn<typeof fetch>()
  const generator = new TestArkVideoGenerator()
  const params: VideoGenerateParams = {
    userId: 'user-1', imageUrl: '', prompt: 'Follow video 1 and use audio 1 as background music',
    options: { modelId: 'doubao-seedance-2-0-260128', duration: 11, aspectRatio: '16:9', generateAudio: true, watermark: false },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock.mockReset()
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ id: 'cgt-test-1' })))
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => vi.unstubAllGlobals())

  function requestBody() {
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks')
    expect(init).toMatchObject({ method: 'POST', headers: { Authorization: 'Bearer ark-test-key', 'Content-Type': 'application/json' } })
    return JSON.parse(String(init?.body))
  }

  it('submits the official text + two reference images + video + audio request', async () => {
    const result = await generator.generate({ ...params, options: {
      ...params.options,
      referenceImages: ['https://example.com/one.png', 'https://example.com/two.png'],
      referenceVideos: ['https://example.com/reference.mp4'],
      referenceAudios: ['https://example.com/reference.mp3'],
    } })
    expect(result).toMatchObject({ success: true, async: true, externalId: 'ARK:VIDEO:cgt-test-1' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(requestBody()).toEqual({
      model: 'doubao-seedance-2-0-260128',
      content: [
        { type: 'text', text: params.prompt },
        { type: 'image_url', image_url: { url: `data:image/png;base64,${Buffer.from('https://example.com/one.png').toString('base64')}` }, role: 'reference_image' },
        { type: 'image_url', image_url: { url: `data:image/png;base64,${Buffer.from('https://example.com/two.png').toString('base64')}` }, role: 'reference_image' },
        { type: 'video_url', video_url: { url: 'https://example.com/reference.mp4' }, role: 'reference_video' },
        { type: 'audio_url', audio_url: { url: 'https://example.com/reference.mp3' }, role: 'reference_audio' },
      ],
      ratio: '16:9', duration: 11, generate_audio: true, watermark: false,
    })
    expect(media.base64).not.toHaveBeenCalledWith('')
  })

  it('supports text-only generation without attempting to read a missing image', async () => {
    expect(await generator.generate(params)).toMatchObject({ success: true })
    expect(requestBody().content).toEqual([{ type: 'text', text: params.prompt }])
    expect(media.base64).not.toHaveBeenCalled()
  })

  it('keeps single-image input compatible with Seedance 1.0', async () => {
    expect(await generator.generate({ ...params, imageUrl: 'asset://first', options: {
      modelId: 'doubao-seedance-1-0-pro-250528', duration: 5,
    } })).toMatchObject({ success: true })
    expect(requestBody().content).toEqual([
      { type: 'text', text: params.prompt },
      { type: 'image_url', image_url: { url: 'asset://first' } },
    ])
  })

  it('keeps explicit first and last frames when no multimodal reference is supplied', async () => {
    await generator.submit({ ...params, imageUrl: 'https://example.com/first.png', options: {
      ...params.options, lastFrameImageUrl: 'https://example.com/last.png',
    } })
    expect(requestBody().content).toEqual([
      { type: 'text', text: params.prompt },
      { type: 'image_url', image_url: { url: expect.any(String) }, role: 'first_frame' },
      { type: 'image_url', image_url: { url: expect.any(String) }, role: 'last_frame' },
    ])
  })

  it('uses the primary image as a reference when combined with reference audio', async () => {
    await generator.submit({ ...params, imageUrl: 'asset://ark-image', options: {
      ...params.options, referenceAudios: ['/api/storage/sign?key=voice/reference.mp3'],
    } })
    expect(requestBody().content).toEqual([
      { type: 'text', text: params.prompt },
      { type: 'image_url', image_url: { url: 'asset://ark-image' }, role: 'reference_image' },
      { type: 'audio_url', audio_url: { url: 'https://storage.example.com/reference.mp3' }, role: 'reference_audio' },
    ])
    expect(media.base64).not.toHaveBeenCalled()
  })

  it('preserves false audio generation and supports the documented adaptive duration for Seedance 2.0', async () => {
    await generator.submit({ ...params, options: { ...params.options, duration: -1, generateAudio: false } })
    expect(requestBody()).toMatchObject({ duration: -1, generate_audio: false })
  })

  it.each([
    [{ referenceImages: 'not-an-array' }, 'referenceImages must be an array'],
    [{ referenceImages: [''] }, 'referenceImages[0] must be a non-empty string'],
    [{ referenceAudios: ['https://example.com/ref.mp3'] }, 'reference audio requires an image or video'],
    [{ referenceImages: Array(10).fill('asset://image') }, 'referenceImages exceeds 9 images'],
    [{ referenceVideos: Array(4).fill('https://example.com/ref.mp4') }, 'referenceVideos exceeds 3 videos'],
    [{ referenceImages: ['asset://image'], referenceAudios: Array(4).fill('https://example.com/ref.mp3') }, 'referenceAudios exceeds 3 audios'],
    [{ lastFrameImageUrl: 'asset://last' }, 'lastFrameImageUrl requires a first frame'],
    [{ lastFrameImageUrl: 'asset://last', referenceImages: ['asset://ref'] }, 'first/last frames cannot be combined with multimodal references'],
    [{ modelId: 'doubao-seedance-1-0-pro-250528', generateAudio: undefined, referenceImages: ['asset://ref'] }, 'multimodal references require Seedance 2.0'],
  ])('rejects invalid input before any upstream request: %j', async (options, message) => {
    await expect(generator.submit({ ...params, options: { ...params.options, ...options } })).rejects.toThrow(message)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects an empty generation request before contacting Ark', async () => {
    await expect(generator.submit({ ...params, prompt: '' })).rejects.toThrow('prompt or visual input is required')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
