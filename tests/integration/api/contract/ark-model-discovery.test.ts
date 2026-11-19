import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

const state = vi.hoisted(() => ({ authenticated: true }))
const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  discoverModels: vi.fn(),
  decryptApiKey: vi.fn(() => 'saved-test-key'),
}))
vi.mock('@/lib/api-auth', () => ({
  isErrorResponse: (value: unknown) => value instanceof Response,
  requireUserAuth: async () => state.authenticated
    ? { session: { user: { id: 'current-user' } } }
    : new Response('{}', { status: 401 }),
}))
vi.mock('@/lib/prisma', () => ({ prisma: { userPreference: { findUnique: mocks.findUnique } } }))
vi.mock('@/lib/crypto-utils', () => ({ decryptApiKey: mocks.decryptApiKey }))
vi.mock('@/lib/user-api/model-discovery', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/user-api/model-discovery')>(),
  discoverModels: mocks.discoverModels,
}))

describe('api contract - Ark model discovery', () => {
  const context = { params: Promise.resolve({}) }
  beforeEach(() => {
    vi.clearAllMocks()
    state.authenticated = true
    mocks.findUnique.mockResolvedValue({ customProviders: JSON.stringify([{ id: 'ark', apiKey: 'encrypted' }]) })
    mocks.decryptApiKey.mockReturnValue('saved-test-key')
    mocks.discoverModels.mockResolvedValue({ models: [], discoveredAt: '2026-11-19T00:00:00Z', partial: false, warnings: [], cacheHit: false })
  })

  it('uses the official endpoint and saved user credentials, ignoring browser credentials', async () => {
    const { POST } = await import('@/app/api/user/api-config/discover-models/route')
    const response = await POST(buildMockRequest({ path: '/api/user/api-config/discover-models', method: 'POST', body: {
      providerId: 'ark', forceRefresh: true, apiKey: 'untrusted-key', baseUrl: 'http://127.0.0.1', userId: 'other-user',
    } }), context)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ models: [], partial: false })
    expect(mocks.findUnique).toHaveBeenCalledWith({ where: { userId: 'current-user' }, select: { customProviders: true } })
    expect(mocks.decryptApiKey).toHaveBeenCalledWith('encrypted')
    expect(mocks.discoverModels).toHaveBeenCalledWith({
      userId: 'current-user', providerId: 'ark', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', apiKey: 'saved-test-key', forceRefresh: true,
    })
  })

  it('requires authentication before reading saved configuration', async () => {
    state.authenticated = false
    const { POST } = await import('@/app/api/user/api-config/discover-models/route')
    const response = await POST(buildMockRequest({ path: '/api/user/api-config/discover-models', method: 'POST', body: { providerId: 'ark' } }), context)
    expect(response.status).toBe(401)
    expect(mocks.findUnique).not.toHaveBeenCalled()
  })

  it('does not use a provider outside the current user saved configuration', async () => {
    mocks.findUnique.mockResolvedValue({ customProviders: '[]' })
    const { POST } = await import('@/app/api/user/api-config/discover-models/route')
    const response = await POST(buildMockRequest({ path: '/api/user/api-config/discover-models', method: 'POST', body: { providerId: 'ark' } }), context)
    expect(response.status).toBe(404)
    expect(mocks.discoverModels).not.toHaveBeenCalled()
  })

  it.each(['', '   '])('does not send a request with an empty decrypted key', async (key) => {
    mocks.decryptApiKey.mockReturnValue(key)
    const { POST } = await import('@/app/api/user/api-config/discover-models/route')
    const response = await POST(buildMockRequest({ path: '/api/user/api-config/discover-models', method: 'POST', body: { providerId: 'ark' } }), context)
    expect(response.status).toBe(400)
    expect(mocks.discoverModels).not.toHaveBeenCalled()
  })
})
