import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'
import {
  installAuthMocks,
  mockAuthenticated,
  mockUnauthenticated,
  resetAuthMockState,
} from '../../../helpers/auth'

const configMock = vi.hoisted(() => ({
  getUserModelConfig: vi.fn(async () => ({ videoModel: 'maas-seedance::doubao-seedance-2.0' })),
}))
const submitTaskMock = vi.hoisted(() => vi.fn(async () => ({
  success: true,
  async: true,
  taskId: 'task-trial-1',
  status: 'queued',
})))

vi.mock('@/lib/config-service', () => configMock)
vi.mock('@/lib/task/submitter', () => ({ submitTask: submitTaskMock }))

describe('api specific - virtual human material trial route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    resetAuthMockState()
  })

  it('returns unauthorized when user is not authenticated', async () => {
    installAuthMocks()
    mockUnauthenticated()
    const mod = await import('@/app/api/asset-hub/virtual-human-trial/route')
    const res = await mod.POST(buildMockRequest({
      path: '/api/asset-hub/virtual-human-trial',
      method: 'POST',
      body: { assetUri: 'asset://asset-1', prompt: '人物微笑' },
    }), { params: Promise.resolve({}) })
    expect(res.status).toBe(401)
  })

  it('rejects a direct face image URL instead of a trusted asset URI', async () => {
    installAuthMocks()
    mockAuthenticated('user-a')
    const mod = await import('@/app/api/asset-hub/virtual-human-trial/route')
    const res = await mod.POST(buildMockRequest({
      path: '/api/asset-hub/virtual-human-trial',
      method: 'POST',
      body: { assetUri: 'https://example.com/face.png', prompt: '人物微笑' },
    }), { params: Promise.resolve({}) })
    expect(res.status).toBe(400)
  })

  it('submits a 480p four-second trial task without creating an asset record', async () => {
    installAuthMocks()
    mockAuthenticated('user-a')
    const mod = await import('@/app/api/asset-hub/virtual-human-trial/route')
    const res = await mod.POST(buildMockRequest({
      path: '/api/asset-hub/virtual-human-trial',
      method: 'POST',
      body: { assetUri: 'asset://asset-20260222234430-mxpgh', prompt: '人物自然转身并微笑' },
      headers: { 'accept-language': 'zh-CN' },
    }), { params: Promise.resolve({}) })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.taskId).toBe('task-trial-1')
    expect(submitTaskMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-a',
      projectId: 'global-asset-hub',
      targetType: 'VirtualHumanTrial',
      payload: expect.objectContaining({
        assetUri: 'asset://asset-20260222234430-mxpgh',
        videoModel: 'maas-seedance::doubao-seedance-2.0',
        generationOptions: {
          resolution: '480p',
          duration: 4,
          aspectRatio: '16:9',
          generateAudio: false,
        },
      }),
    }))
  })
})
