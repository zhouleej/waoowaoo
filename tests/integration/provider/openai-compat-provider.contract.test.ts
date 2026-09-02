import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { generateVideoViaOpenAICompatTemplate } from '@/lib/model-gateway/openai-compat/template-video'
import { MaasSeedanceVideoGenerator } from '@/lib/generators/video/maas-seedance'
import { pollAsyncTask } from '@/lib/async-poll'
import { startScenarioServer } from '../../helpers/fakes/scenario-server'

const getProviderConfigMock = vi.hoisted(() => vi.fn())
const getUserModelsMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/api-config', () => ({
  getProviderConfig: getProviderConfigMock,
  getUserModels: getUserModelsMock,
}))

function encode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url')
}

describe('provider contract - openai compatible media template', () => {
  let server: Awaited<ReturnType<typeof startScenarioServer>> | null = null

  beforeEach(async () => {
    server = await startScenarioServer()
    vi.clearAllMocks()
    getProviderConfigMock.mockResolvedValue({
      id: 'openai-compatible:provider-local',
      apiKey: 'sk-local',
      baseUrl: `${server.baseUrl}/compat/v1`,
    })
  })

  afterEach(async () => {
    await server?.close()
    server = null
  })

  it('renders create request against provider baseUrl and returns OCOMPAT externalId', async () => {
    server!.defineScenario({
      method: 'POST',
      path: '/compat/v1/video/create',
      mode: 'success',
      submitResponse: {
        status: 200,
        body: { status: 'queued', task_id: 'task_local_1' },
      },
    })

    const result = await generateVideoViaOpenAICompatTemplate({
      userId: 'user-local',
      providerId: 'openai-compatible:provider-local',
      modelId: 'veo-local',
      modelKey: 'openai-compatible:provider-local::veo-local',
      imageUrl: 'data:image/png;base64,AAAA',
      prompt: 'animate this frame',
      options: {
        duration: 5,
        aspectRatio: '9:16',
      },
      profile: 'openai-compatible',
      template: {
        version: 1,
        mediaType: 'video',
        mode: 'async',
        create: {
          method: 'POST',
          path: '/video/create',
          bodyTemplate: {
            model: '{{model}}',
            prompt: '{{prompt}}',
            image: '{{image}}',
            duration: '{{duration}}',
          },
        },
        status: { method: 'GET', path: '/video/status/{{task_id}}' },
        response: {
          taskIdPath: '$.task_id',
          statusPath: '$.status',
        },
        polling: {
          intervalMs: 1000,
          timeoutMs: 30_000,
          doneStates: ['done'],
          failStates: ['failed'],
        },
      },
    })

    expect(result).toMatchObject({
      success: true,
      async: true,
      requestId: 'task_local_1',
      externalId: `OCOMPAT:VIDEO:b64_${encode('openai-compatible:provider-local')}:${encode('veo-local')}:task_local_1`,
    })

    const requests = server!.getRequests('POST', '/compat/v1/video/create')
    expect(requests).toHaveLength(1)
    expect(requests[0]?.headers.authorization).toBe('Bearer sk-local')
    expect(JSON.parse(requests[0]?.bodyText || '{}')).toEqual({
      model: 'veo-local',
      prompt: 'animate this frame',
      image: 'data:image/png;base64,AAAA',
      duration: 5,
    })
  })

  it('polls localhost provider status and falls back to content endpoint when output url is missing', async () => {
    getUserModelsMock.mockResolvedValue([
      {
        modelKey: 'openai-compatible:provider-local::veo-local',
        modelId: 'veo-local',
        name: 'Local Veo',
        type: 'video',
        provider: 'openai-compatible:provider-local',
        price: 0,
        compatMediaTemplate: {
          version: 1,
          mediaType: 'video',
          mode: 'async',
          create: { method: 'POST', path: '/video/create' },
          status: { method: 'GET', path: '/video/status/{{task_id}}' },
          content: { method: 'GET', path: '/video/content/{{task_id}}' },
          response: {
            statusPath: '$.status',
          },
          polling: {
            intervalMs: 1000,
            timeoutMs: 30_000,
            doneStates: ['done'],
            failStates: ['failed'],
          },
        },
      },
    ])
    server!.defineScenario({
      method: 'GET',
      path: '/compat/v1/video/status/task_local_2',
      mode: 'queued_then_success',
      pollSequence: [
        { status: 200, body: { status: 'running' } },
        { status: 200, body: { status: 'done' } },
      ],
    })

    const first = await pollAsyncTask(
      `OCOMPAT:VIDEO:${encode('openai-compatible:provider-local')}:${encode('openai-compatible:provider-local::veo-local')}:task_local_2`,
      'user-local',
    )
    const second = await pollAsyncTask(
      `OCOMPAT:VIDEO:${encode('openai-compatible:provider-local')}:${encode('openai-compatible:provider-local::veo-local')}:task_local_2`,
      'user-local',
    )

    expect(first).toEqual({ status: 'pending' })
    expect(second).toEqual({
      status: 'completed',
      resultUrl: `${server!.baseUrl}/compat/v1/video/content/task_local_2`,
      videoUrl: `${server!.baseUrl}/compat/v1/video/content/task_local_2`,
      downloadHeaders: {
        Authorization: 'Bearer sk-local',
      },
    })
  })

  it('submits MAAS Seedance provider payload with normalized options and auth', async () => {
    getProviderConfigMock.mockResolvedValue({
      id: 'maas-seedance',
      apiKey: 'maas-local-key',
      baseUrl: server!.baseUrl,
    })
    server!.defineScenario({
      method: 'POST',
      path: '/v1/videos/generations',
      mode: 'success',
      submitResponse: {
        status: 200,
        body: { id: 'maas_task_1', status: 'processing' },
      },
    })

    const generator = new MaasSeedanceVideoGenerator()
    const result = await generator.generate({
      userId: 'user-local',
      imageUrl: 'https://media.example.com/first.png',
      prompt: '  animate the product  ',
      options: {
        provider: 'maas-seedance',
        modelId: 'doubao-seedance-2.0',
        duration: 5,
        aspectRatio: '16:9',
        resolution: '1080p',
        generateAudio: true,
        watermark: false,
        lastFrameImageUrl: 'https://media.example.com/last.png',
        referenceImages: ['https://media.example.com/reference.png'],
      },
    })

    expect(result).toEqual({
      success: true,
      async: true,
      requestId: 'maas_task_1',
      externalId: 'MAAS:VIDEO:maas-seedance:maas_task_1',
    })
    const requests = server!.getRequests('POST', '/v1/videos/generations')
    expect(requests).toHaveLength(1)
    expect(requests[0]?.headers.authorization).toBe('Bearer maas-local-key')
    expect(JSON.parse(requests[0]?.bodyText || '{}')).toEqual({
      model: 'doubao-seedance-2.0',
      prompt: 'animate the product',
      image_url: 'https://media.example.com/first.png',
      last_frame_image_url: 'https://media.example.com/last.png',
      reference_images: ['https://media.example.com/reference.png'],
      reference_videos: [],
      reference_audios: [],
      duration: 5,
      ratio: '16:9',
      resolution: '1080p',
      generate_audio: true,
      watermark: false,
    })
  })

  it('passes trusted asset URIs through to the MAAS adapter without treating them as public URLs', async () => {
    getProviderConfigMock.mockResolvedValue({
      id: 'maas-seedance',
      apiKey: 'maas-local-key',
      baseUrl: server!.baseUrl,
    })
    server!.defineScenario({
      method: 'POST',
      path: '/v1/videos/generations',
      mode: 'success',
      submitResponse: {
        status: 200,
        body: { id: 'maas_asset_trial_1', status: 'processing' },
      },
    })

    const generator = new MaasSeedanceVideoGenerator()
    await generator.generate({
      userId: 'user-local',
      imageUrl: 'asset://asset-20260222234430-mxpgh',
      prompt: '人物自然转身并微笑',
      options: {
        provider: 'maas-seedance',
        modelId: 'doubao-seedance-2.0',
        referenceImages: ['asset://asset-20260222234430-mxpgh'],
      },
    })

    const requests = server!.getRequests('POST', '/v1/videos/generations')
    expect(JSON.parse(requests[0]?.bodyText || '{}')).toEqual(expect.objectContaining({
      image_url: 'asset://asset-20260222234430-mxpgh',
      reference_images: ['asset://asset-20260222234430-mxpgh'],
    }))
  })

  it('fails explicitly when async create response omits task id', async () => {
    server!.defineScenario({
      method: 'POST',
      path: '/compat/v1/video/create',
      mode: 'malformed_response',
      submitResponse: {
        status: 200,
        body: { status: 'queued' },
      },
    })

    await expect(
      generateVideoViaOpenAICompatTemplate({
        userId: 'user-local',
        providerId: 'openai-compatible:provider-local',
        modelId: 'veo-local',
        modelKey: 'openai-compatible:provider-local::veo-local',
        imageUrl: 'data:image/png;base64,AAAA',
        prompt: 'bad create payload',
        profile: 'openai-compatible',
        template: {
          version: 1,
          mediaType: 'video',
          mode: 'async',
          create: {
            method: 'POST',
            path: '/video/create',
            bodyTemplate: { prompt: '{{prompt}}' },
          },
          status: { method: 'GET', path: '/video/status/{{task_id}}' },
          response: {
            taskIdPath: '$.task_id',
            statusPath: '$.status',
          },
          polling: {
            intervalMs: 1000,
            timeoutMs: 30_000,
            doneStates: ['done'],
            failStates: ['failed'],
          },
        },
      }),
    ).rejects.toThrow('OPENAI_COMPAT_VIDEO_TEMPLATE_TASK_ID_NOT_FOUND')
  })
})
