import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'
import { installAuthMocks, mockAuthenticated, resetAuthMockState } from '../../../helpers/auth'

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  discoverModels: vi.fn(async () => ({ models: [], discoveredAt: '2026-07-16T00:00:00.000Z', partial: false, warnings: [], cacheHit: false })),
  decryptApiKey: vi.fn(() => 'decrypted-secret'),
}))
vi.mock('@/lib/prisma', () => ({ prisma: { userPreference: { findUnique: mocks.findUnique } } }))
vi.mock('@/lib/crypto-utils', () => ({ decryptApiKey: mocks.decryptApiKey }))
vi.mock('@/lib/user-api/model-discovery', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/user-api/model-discovery')>()
  return { ...actual, discoverModels: mocks.discoverModels }
})

describe('api specific - discover models auth and ownership', () => {
  const context = { params: Promise.resolve({}) }
  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); resetAuthMockState(); installAuthMocks() })

  it('reads saved credentials on the server and does not require browser key retransmission', async () => {
    mockAuthenticated('user-1')
    mocks.findUnique.mockResolvedValue({ customProviders: JSON.stringify([{ id: 'openai-compatible:mine', baseUrl: 'https://api.example.com/v1', apiKey: 'encrypted' }]) })
    const route = await import('@/app/api/user/api-config/discover-models/route')
    const response = await route.POST(buildMockRequest({ path: '/api/user/api-config/discover-models', method: 'POST', body: { providerId: 'openai-compatible:mine' } }), context)
    expect(response.status).toBe(200)
    expect(mocks.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'user-1' } }))
    expect(mocks.discoverModels).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-1', providerId: 'openai-compatible:mine', apiKey: 'decrypted-secret' }))
  })

  it('rejects a provider not present in the current user preference', async () => {
    mockAuthenticated('user-1'); mocks.findUnique.mockResolvedValue({ customProviders: '[]' })
    const route = await import('@/app/api/user/api-config/discover-models/route')
    const response = await route.POST(buildMockRequest({ path: '/api/user/api-config/discover-models', method: 'POST', body: { providerId: 'openai-compatible:other-user' } }), context)
    expect(response.status).toBe(404)
    expect(mocks.discoverModels).not.toHaveBeenCalled()
  })

  it('rejects unsupported provider API types', async () => {
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/api-config/discover-models/route')
    const response = await route.POST(buildMockRequest({ path: '/api/user/api-config/discover-models', method: 'POST', body: { providerId: 'gemini-compatible:x' } }), context)
    expect(response.status).toBe(400)
    expect(mocks.findUnique).not.toHaveBeenCalled()
  })
})
