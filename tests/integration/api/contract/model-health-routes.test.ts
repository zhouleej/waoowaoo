import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

const state = vi.hoisted(() => ({ authenticated: true, userId: 'user-1' }))
const checkModelHealth = vi.hoisted(() => vi.fn())
const checkProviderHealth = vi.hoisted(() => vi.fn())
const getModelHealthStatuses = vi.hoisted(() => vi.fn(async () => []))

vi.mock('@/lib/api-auth', () => ({
  isErrorResponse: (value: unknown) => value instanceof Response,
  requireUserAuth: async () => state.authenticated
    ? { session: { user: { id: state.userId } } }
    : new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED' } }), { status: 401 }),
}))
vi.mock('@/lib/user-api/model-health', () => ({ checkModelHealth, checkProviderHealth, getModelHealthStatuses }))

describe('api contract - model health routes', () => {
  const context = { params: Promise.resolve({}) }

  beforeEach(() => {
    vi.clearAllMocks()
    state.authenticated = true
    state.userId = 'user-1'
    checkModelHealth.mockResolvedValue({ status: 'healthy' })
    checkProviderHealth.mockResolvedValue({ results: [], summary: {} })
  })

  it('requires authentication', async () => {
    state.authenticated = false
    const { POST } = await import('@/app/api/user/api-config/model-health/check/route')
    const response = await POST(buildMockRequest({ path: '/api/user/api-config/model-health/check', method: 'POST', body: { providerId: 'p', modelKey: 'm' } }), context)
    expect(response.status).toBe(401)
    expect(checkModelHealth).not.toHaveBeenCalled()
  })

  it('rejects unknown body fields and does not expose internal detail', async () => {
    const { POST } = await import('@/app/api/user/api-config/model-health/check/route')
    const response = await POST(buildMockRequest({ path: '/api/user/api-config/model-health/check', method: 'POST', body: { providerId: 'p', modelKey: 'm', detail: 'secret' } }), context)
    expect(response.status).toBe(400)
    expect(JSON.stringify(await response.json())).not.toContain('secret')
    expect(checkModelHealth).not.toHaveBeenCalled()
  })

  it('passes authenticated ownership scope to the service', async () => {
    const { POST } = await import('@/app/api/user/api-config/model-health/check/route')
    const response = await POST(buildMockRequest({ path: '/api/user/api-config/model-health/check', method: 'POST', body: { providerId: 'provider-1', modelKey: 'provider-1::model' } }), context)
    expect(response.status).toBe(200)
    expect(checkModelHealth).toHaveBeenCalledWith({ userId: 'user-1', providerId: 'provider-1', modelKey: 'provider-1::model' })
  })
})
