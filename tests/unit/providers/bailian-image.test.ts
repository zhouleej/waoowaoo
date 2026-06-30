import { beforeEach, describe, expect, it, vi } from 'vitest'

const getProviderConfigMock = vi.hoisted(() =>
  vi.fn(async () => ({
    id: 'bailian',
    apiKey: 'bl-key',
  })),
)

vi.mock('@/lib/api-config', () => ({
  getProviderConfig: getProviderConfigMock,
}))

import { generateBailianImage } from '@/lib/providers/bailian/image'

describe('bailian image provider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('submits wan2.6 t2i task with new protocol and returns async externalId', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        request_id: 'req-1',
        output: {
          task_id: 'task-image-123',
          task_status: 'PENDING',
        },
      }),
    }))
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    const result = await generateBailianImage({
      userId: 'user-1',
      prompt: '画一个古风角色',
      options: {
        provider: 'bailian',
        modelId: 'wan2.6-t2i',
        modelKey: 'bailian::wan2.6-t2i',
        aspectRatio: '3:4',
        count: 2,
      },
    })

    expect(getProviderConfigMock).toHaveBeenCalledWith('user-1', 'bailian')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const firstCall = fetchMock.mock.calls[0] as unknown as [RequestInfo | URL, RequestInit] | undefined
    expect(firstCall).toBeDefined()
    if (!firstCall) {
      throw new Error('missing fetch call')
    }
    expect(firstCall[0]).toBe('https://dashscope.aliyuncs.com/api/v1/services/aigc/image-generation/generation')
    expect(firstCall[1].method).toBe('POST')
    expect(firstCall[1].headers).toEqual({
      Authorization: 'Bearer bl-key',
      'Content-Type': 'application/json',
      'X-DashScope-Async': 'enable',
    })
    expect(firstCall[1].body).toBe(JSON.stringify({
      model: 'wan2.6-t2i',
      input: {
        messages: [
          {
            role: 'user',
            content: [{ text: '画一个古风角色' }],
          },
        ],
      },
      parameters: {
        size: '1104*1472',
        n: 2,
      },
    }))
    expect(result).toEqual({
      success: true,
      async: true,
      requestId: 'task-image-123',
      externalId: 'BAILIAN:IMAGE:task-image-123',
    })
  })

  it('submits legacy t2i task to legacy endpoint', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        output: {
          task_id: 'task-legacy-image-1',
          task_status: 'PENDING',
        },
      }),
    }))
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    const result = await generateBailianImage({
      userId: 'user-1',
      prompt: '画一个古风场景',
      options: {
        provider: 'bailian',
        modelId: 'wan2.2-t2i-plus',
        modelKey: 'bailian::wan2.2-t2i-plus',
        size: '1280*1280',
      },
    })

    const firstCall = fetchMock.mock.calls[0] as unknown as [RequestInfo | URL, RequestInit] | undefined
    expect(firstCall).toBeDefined()
    if (!firstCall) {
      throw new Error('missing fetch call')
    }
    expect(firstCall[0]).toBe('https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis')
    expect(firstCall[1].body).toBe(JSON.stringify({
      model: 'wan2.2-t2i-plus',
      input: {
        prompt: '画一个古风场景',
      },
      parameters: {
        size: '1280*1280',
      },
    }))
    expect(result).toEqual({
      success: true,
      async: true,
      requestId: 'task-legacy-image-1',
      externalId: 'BAILIAN:IMAGE:task-legacy-image-1',
    })
  })

  it('ignores reference images from shared image pipeline', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        output: {
          task_id: 'task-reference-ignored',
          task_status: 'PENDING',
        },
      }),
    }))
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    await expect(generateBailianImage({
      userId: 'user-1',
      prompt: '画一个分镜镜头',
      referenceImages: ['https://example.com/reference.png'],
      options: {
        provider: 'bailian',
        modelId: 'wan2.6-t2i',
        modelKey: 'bailian::wan2.6-t2i',
        referenceImages: ['https://example.com/reference.png'],
        aspectRatio: '16:9',
      },
    })).resolves.toMatchObject({
      success: true,
      externalId: 'BAILIAN:IMAGE:task-reference-ignored',
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('fails fast when options contain unsupported field', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    await expect(
      generateBailianImage({
        userId: 'user-1',
        prompt: 'test',
        options: {
          provider: 'bailian',
          modelId: 'wan2.2-t2i-plus',
          modelKey: 'bailian::wan2.2-t2i-plus',
          duration: 5,
        },
      }),
    ).rejects.toThrow(/BAILIAN_IMAGE_OPTION_UNSUPPORTED: duration/)

    expect(fetchMock).not.toHaveBeenCalled()
  })
})
