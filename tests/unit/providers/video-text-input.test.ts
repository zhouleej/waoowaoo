import { beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ generate: vi.fn().mockResolvedValue({ name: 'operation' }), fetch: vi.fn() }))
vi.mock('@/lib/api-config', () => ({ getProviderConfig: async () => ({ apiKey: 'test', baseUrl: 'https://adapter.example' }) }))
vi.mock('@google/genai', () => ({ GoogleGenAI: class { models = { generateVideos: state.generate } } }))
vi.mock('@/lib/media/outbound-image', () => ({ normalizeToBase64ForGeneration: async (url: string) => url, normalizeToOriginalMediaUrl: async (url: string) => url }))
import { GoogleVeoVideoGenerator } from '@/lib/generators/video/google'
import { MaasSeedanceVideoGenerator } from '@/lib/generators/video/maas-seedance'
describe('text-only video provider requests', () => {
  beforeEach(() => { vi.clearAllMocks(); state.fetch.mockResolvedValue({ ok: true, json: async () => ({ id: 'task' }) }); vi.stubGlobal('fetch', state.fetch) })
  it('omits the image field from Veo text generation', async () => {
    const result = await new GoogleVeoVideoGenerator().generate({ userId: 'user', imageUrl: '', prompt: 'A rainy street' })
    expect(result.success).toBe(true)
    expect(state.generate).toHaveBeenCalledWith({ model: 'veo-3.1-generate-preview', prompt: 'A rainy street' })
  })
  it('omits image_url from the MAAS adapter text request', async () => {
    const result = await new MaasSeedanceVideoGenerator().generate({ userId: 'user', imageUrl: '', prompt: 'A rainy street' })
    expect(result.success).toBe(true)
    const request = state.fetch.mock.calls.find(([url]) => String(url).endsWith('/v1/videos/generations'))
    const body = JSON.parse(request![1].body)
    expect(body.prompt).toBe('A rainy street')
    expect(body).not.toHaveProperty('image_url')
  })
})
