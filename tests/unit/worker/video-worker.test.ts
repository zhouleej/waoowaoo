vi.mock('@/lib/media/video-metadata', () => ({ inspectGeneratedVideo: async () => ({ durationMs: 5000, width: 1280, height: 720, fps: 30 }) }))
import type { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'

type WorkerProcessor = (job: Job<TaskJobData>) => Promise<unknown>

type PanelRow = {
  id: string
  videoUrl: string | null
  imageUrl: string | null
  mobileCloudAssetId?: string | null
  mobileCloudAssetSourceUrl?: string | null
  mobileCloudAssetStatus?: string | null
  videoPrompt: string | null
  description: string | null
  firstLastFramePrompt: string | null
  duration: number | null
}

const workerState = vi.hoisted(() => ({
  processor: null as WorkerProcessor | null,
}))

const reportTaskProgressMock = vi.hoisted(() => vi.fn(async () => undefined))
const withTaskLifecycleMock = vi.hoisted(() =>
  vi.fn(async (job: Job<TaskJobData>, handler: WorkerProcessor) => await handler(job)),
)

const utilsMock = vi.hoisted(() => ({
  assertTaskActive: vi.fn(async () => undefined),
  getProjectModels: vi.fn(async () => ({ videoRatio: '16:9', videoResolution: '720p' })),
  resolveLipSyncVideoSource: vi.fn(async () => 'https://provider.example/lipsync.mp4'),
  resolveVideoSourceFromGeneration: vi.fn<(...args: unknown[]) => Promise<{ url: string; actualVideoTokens?: number; downloadHeaders?: Record<string, string> }>>(async () => ({ url: 'https://provider.example/video.mp4' })),
  toSignedUrlIfCos: vi.fn((url: string | null) => (url ? `https://signed.example/${url}` : null)),
  uploadVideoSourceToCos: vi.fn(async () => 'cos/lip-sync/video.mp4'),
}))
const configServiceMock = vi.hoisted(() => ({
  getUserWorkflowConcurrencyConfig: vi.fn(async () => ({
    analysis: 5,
    image: 5,
    video: 5,
  })),
}))
const concurrencyGateMock = vi.hoisted(() => ({
  withUserConcurrencyGate: vi.fn(async <T>(input: {
    run: () => Promise<T>
  }) => await input.run()),
}))

const modelContractMock = vi.hoisted(() => ({
  parseModelKeyStrict: vi.fn(() => ({ provider: 'fal' })),
}))

const outboundImageMock = vi.hoisted(() => ({
  normalizeToBase64ForGeneration: vi.fn(async (input: string) => input),
  normalizeToOriginalMediaUrl: vi.fn(async (input: string) => input.startsWith('http') ? input : `https://public.example/${input}`),
}))

const prismaMock = vi.hoisted(() => ({
  inspirationVideoCreation: {
    findUnique: vi.fn(),
    update: vi.fn(async () => undefined),
  },
  novelPromotionPanel: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(async () => undefined),
  },
  novelPromotionVoiceLine: {
    findUnique: vi.fn(),
  },
}))
const storageMock = vi.hoisted(() => ({
  getSignedUrl: vi.fn((key: string) => `/api/storage/sign?key=${encodeURIComponent(key)}`),
  getStorageProxyUrl: vi.fn((key: string) => `/api/storage/proxy?key=${encodeURIComponent(key)}&expires=proxy`),
}))
const mobileCloudAssetClientMock = vi.hoisted(() => ({
  getAsset: vi.fn(),
}))

vi.mock('bullmq', () => ({
  Queue: class {
    constructor(name: string) {
      void name
    }

    async add() {
      return { id: 'job-1' }
    }

    async getJob() {
      return null
    }
  },
  Worker: class {
    constructor(name: string, processor: WorkerProcessor) {
      void name
      workerState.processor = processor
    }
  },
}))

vi.mock('@/lib/redis', () => ({ queueRedis: {} }))
vi.mock('@/lib/workers/shared', () => ({
  reportTaskProgress: reportTaskProgressMock,
  withTaskLifecycle: withTaskLifecycleMock,
}))
vi.mock('@/lib/workers/utils', () => utilsMock)
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/storage', () => storageMock)
vi.mock('@/lib/media/outbound-image', () => outboundImageMock)
vi.mock('@/lib/env', () => ({ getPublicBaseUrl: () => 'https://app.example' }))
vi.mock('@/lib/mobile-cloud-maas/asset-client', () => ({
  mobileCloudMaasAssetClient: mobileCloudAssetClientMock,
}))
vi.mock('@/lib/model-capabilities/lookup', () => ({
  resolveBuiltinCapabilitiesByModelKey: vi.fn(() => ({
    video: { firstlastframe: true, generateAudioOptions: [true, false] },
  })),
}))
vi.mock('@/lib/model-config-contract', () => modelContractMock)
vi.mock('@/lib/api-config', () => ({
  getProviderConfig: vi.fn(async () => ({ apiKey: 'api-key' })),
  getProviderKey: vi.fn((provider?: string) => provider || ''),
}))
vi.mock('@/lib/config-service', () => configServiceMock)
vi.mock('@/lib/workers/user-concurrency-gate', () => concurrencyGateMock)

function buildPanel(overrides?: Partial<PanelRow>): PanelRow {
  return {
    id: 'panel-1',
    videoUrl: 'cos/base-video.mp4',
    imageUrl: 'cos/panel-image.png',
    videoPrompt: 'panel prompt',
    description: 'panel description',
    firstLastFramePrompt: null,
    duration: 5,
    ...(overrides || {}),
  }
}

function buildJob(params: {
  type: TaskJobData['type']
  payload?: Record<string, unknown>
  targetType?: string
  targetId?: string
}): Job<TaskJobData> {
  return {
    data: {
      taskId: 'task-1',
      type: params.type,
      locale: 'zh',
      projectId: 'project-1',
      episodeId: 'episode-1',
      targetType: params.targetType ?? 'NovelPromotionPanel',
      targetId: params.targetId ?? 'panel-1',
      payload: params.payload ?? {},
      userId: 'user-1',
    },
  } as unknown as Job<TaskJobData>
}

describe('worker video processor behavior', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    workerState.processor = null

    prismaMock.novelPromotionPanel.findUnique.mockResolvedValue(buildPanel())
    prismaMock.novelPromotionPanel.findFirst.mockResolvedValue(buildPanel())
    prismaMock.inspirationVideoCreation.findUnique.mockResolvedValue({
      id: 'creation-1',
      prompt: 'A slow camera push through a rainy neon street',
      modelKey: 'maas-seedance::doubao-seedance-2.0',
      aspectRatio: '16:9',
      resolution: '720p',
      duration: 5,
      generateAudio: true,
      workspace: { projectId: 'project-1' },
      assets: [
        { kind: 'primary_image', storageKey: 'inspiration/primary.jpg', sortOrder: 0 },
        { kind: 'reference_image', storageKey: 'inspiration/reference.jpg', sortOrder: 0 },
        { kind: 'reference_audio', storageKey: 'inspiration/reference.mp3', sortOrder: 0 },
      ],
    })
    modelContractMock.parseModelKeyStrict.mockReturnValue({ provider: 'fal' })
    prismaMock.novelPromotionVoiceLine.findUnique.mockResolvedValue({
      id: 'line-1',
      audioUrl: 'cos/line-1.mp3',
      audioDuration: 1200,
    })
    mobileCloudAssetClientMock.getAsset.mockResolvedValue({
      assetId: 'asset-panel-1',
      assetName: 'panel material',
      assetType: 'Image',
      status: 'ACTIVE',
      groupId: 'group-1',
      assetUrl: 'https://mobile-cloud.example/asset.png',
    })

    const mod = await import('@/lib/workers/video.worker')
    mod.createVideoWorker()
  })

  it('VIDEO_PANEL: 缺少 payload.videoModel 时显式失败', async () => {
    const processor = workerState.processor
    expect(processor).toBeTruthy()

    const job = buildJob({
      type: TASK_TYPE.VIDEO_PANEL,
      payload: {},
    })

    await expect(processor!(job)).rejects.toThrow('VIDEO_MODEL_REQUIRED: payload.videoModel is required')
  })
  it('rejects first-last-frame generation without a selected last image', async () => {
    await expect(workerState.processor!(buildJob({ type: TASK_TYPE.VIDEO_PANEL,
      payload: { videoModel: 'maas-seedance::doubao-seedance-2.0', firstLastFrame: { flModel: 'maas-seedance::doubao-seedance-2.0' } },
    }))).rejects.toThrow('VIDEO_LAST_FRAME_REQUIRED')
    expect(utilsMock.resolveVideoSourceFromGeneration).not.toHaveBeenCalled()
  })

  it('VIDEO_PANEL: 透传异步轮询返回的下载头到 COS 上传', async () => {
    const processor = workerState.processor
    expect(processor).toBeTruthy()

    utilsMock.resolveVideoSourceFromGeneration.mockResolvedValueOnce({
      url: 'https://provider.example/video.mp4',
      downloadHeaders: {
        Authorization: 'Bearer oa-key',
      },
    })

    const job = buildJob({
      type: TASK_TYPE.VIDEO_PANEL,
      payload: {
        videoModel: 'openai-compatible:oa-1::sora-2',
        generationOptions: {
          duration: 8,
          resolution: '720p',
        },
      },
    })

    await processor!(job)

    expect(utilsMock.uploadVideoSourceToCos).toHaveBeenCalledWith(
      'https://provider.example/video.mp4',
      'panel-video',
      'panel-1',
      {
        Authorization: 'Bearer oa-key',
      },
    )
  })

  it('VIDEO_PANEL: MAAS 首尾帧复用 outbound media 归一化并传入公网 URL', async () => {
    const processor = workerState.processor
    expect(processor).toBeTruthy()
    modelContractMock.parseModelKeyStrict.mockReturnValue({ provider: 'maas-seedance' })
    prismaMock.novelPromotionPanel.findUnique.mockResolvedValueOnce(buildPanel({ imageUrl: '/api/files/images/first.png' }))
    prismaMock.novelPromotionPanel.findFirst.mockResolvedValueOnce(buildPanel({ imageUrl: 'images/last.png' }))

    await processor!(buildJob({
      type: TASK_TYPE.VIDEO_PANEL,
      payload: {
        videoModel: 'maas-seedance::doubao-seedance-2.0',
        firstLastFrame: {
          lastFrameStoryboardId: 'storyboard-2',
          lastFramePanelIndex: 0,
          flModel: 'maas-seedance::doubao-seedance-2.0',
        },
      },
    }))

    expect(outboundImageMock.normalizeToOriginalMediaUrl).toHaveBeenCalledTimes(2)
    expect(utilsMock.resolveVideoSourceFromGeneration).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        imageUrl: 'https://signed.example//api/files/images/first.png',
        options: expect.objectContaining({
          lastFrameImageUrl: 'https://signed.example/images/last.png',
        }),
      }),
    )
  })

  it('VIDEO_PANEL: 将 Ark 返回的实际视频 token 用量透传到任务结果', async () => {
    const processor = workerState.processor
    expect(processor).toBeTruthy()

    utilsMock.resolveVideoSourceFromGeneration.mockResolvedValueOnce({
      url: 'https://provider.example/video.mp4',
      actualVideoTokens: 108000,
    })

    const job = buildJob({
      type: TASK_TYPE.VIDEO_PANEL,
      payload: {
        videoModel: 'ark::doubao-seedance-2-0-260128',
        generationOptions: {
          duration: 5,
          resolution: '720p',
        },
      },
    })

    const result = await processor!(job) as { panelId: string; videoUrl: string; actualVideoTokens: number }
    expect(result).toEqual({
      panelId: 'panel-1',
      videoUrl: 'cos/lip-sync/video.mp4',
      actualVideoTokens: 108000,
    })
    expect(prismaMock.novelPromotionPanel.update).toHaveBeenCalledWith({
      where: { id: 'panel-1' },
      data: expect.objectContaining({
        videoUrl: 'cos/lip-sync/video.mp4', videoMediaId: null,
        lipSyncVideoUrl: null, lipSyncVideoMediaId: null, lipSyncTaskId: null,
      }),
    })
  })

  it('ASSET_HUB_VIRTUAL_HUMAN_TRIAL: 仅接受 asset URI 并返回不落库的预览地址', async () => {
    const processor = workerState.processor
    expect(processor).toBeTruthy()
    modelContractMock.parseModelKeyStrict.mockReturnValue({ provider: 'maas-seedance' })
    utilsMock.resolveVideoSourceFromGeneration.mockResolvedValueOnce({ url: 'https://provider.example/trial.mp4' })
    utilsMock.uploadVideoSourceToCos.mockResolvedValueOnce('virtual-human-trial/trial.mp4')

    const result = await processor!(buildJob({
      type: TASK_TYPE.ASSET_HUB_VIRTUAL_HUMAN_TRIAL,
      targetType: 'VirtualHumanTrial',
      targetId: 'user-1',
      payload: {
        assetUri: 'asset://asset-20260222234430-mxpgh',
        prompt: '人物自然转身并微笑',
        videoModel: 'maas-seedance::doubao-seedance-2.0',
        generationOptions: { resolution: '480p', duration: 4 },
      },
    }))

    expect(utilsMock.resolveVideoSourceFromGeneration).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ imageUrl: 'asset://asset-20260222234430-mxpgh' }),
    )
    expect(result).toEqual(expect.objectContaining({
      success: true,
      assetUri: 'asset://asset-20260222234430-mxpgh',
      videoUrl: '/api/storage/sign?key=virtual-human-trial%2Ftrial.mp4',
    }))
    expect(prismaMock.novelPromotionPanel.update).not.toHaveBeenCalled()
  })

  it('ASSET_HUB_VIRTUAL_HUMAN_TRIAL: rejects non-MaaS model', async () => {
    const processor = workerState.processor
    expect(processor).toBeTruthy()
    modelContractMock.parseModelKeyStrict.mockReturnValue({ provider: 'ark' })

    await expect(processor!(buildJob({
      type: TASK_TYPE.ASSET_HUB_VIRTUAL_HUMAN_TRIAL,
      payload: {
        assetUri: 'asset://asset-1',
        prompt: '人物微笑',
        videoModel: 'ark::doubao-seedance-2.0',
      },
    }))).rejects.toThrow('VIRTUAL_HUMAN_TRIAL_REQUIRES_MAAS_SEEDANCE')
  })

  it('LIP_SYNC: 缺少 panel 时显式失败', async () => {
    const processor = workerState.processor
    expect(processor).toBeTruthy()

    prismaMock.novelPromotionPanel.findUnique.mockResolvedValueOnce(null)
    const job = buildJob({
      type: TASK_TYPE.LIP_SYNC,
      payload: { voiceLineId: 'line-1' },
      targetId: 'panel-missing',
    })

    await expect(processor!(job)).rejects.toThrow('Lip-sync panel not found')
  })

  it('LIP_SYNC: 正常路径写回 lipSyncVideoUrl 并清理 lipSyncTaskId', async () => {
    const processor = workerState.processor
    expect(processor).toBeTruthy()

    const job = buildJob({
      type: TASK_TYPE.LIP_SYNC,
      payload: {
        voiceLineId: 'line-1',
        lipSyncModel: 'fal::lipsync-model',
      },
      targetId: 'panel-1',
    })

    const result = await processor!(job) as { panelId: string; voiceLineId: string; lipSyncVideoUrl: string }
    expect(result).toEqual({
      panelId: 'panel-1',
      voiceLineId: 'line-1',
      lipSyncVideoUrl: 'cos/lip-sync/video.mp4',
    })

    expect(utilsMock.resolveLipSyncVideoSource).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: 'user-1',
        modelKey: 'fal::lipsync-model',
        audioDurationMs: 1200,
        videoDurationMs: 5000,
      }),
    )

    expect(prismaMock.novelPromotionPanel.update).toHaveBeenCalledWith({
      where: { id: 'panel-1' },
      data: {
        lipSyncVideoUrl: 'cos/lip-sync/video.mp4',
        lipSyncVideoMediaId: null,
        lipSyncTaskId: null,
      },
    })
  })

  it('未知任务类型: 显式报错', async () => {
    const processor = workerState.processor
    expect(processor).toBeTruthy()

    const unsupportedJob = buildJob({
      type: TASK_TYPE.AI_CREATE_CHARACTER,
    })

    await expect(processor!(unsupportedJob)).rejects.toThrow('Unsupported video task type')
  })

  it('VIDEO_PANEL: inspiration creation passes image and audio references and persists its own output', async () => {
    const processor = workerState.processor
    expect(processor).toBeTruthy()
    modelContractMock.parseModelKeyStrict.mockReturnValue({ provider: 'maas-seedance' })
    utilsMock.uploadVideoSourceToCos.mockResolvedValueOnce('inspiration-video/result.mp4')

    const result = await processor!(buildJob({
      type: TASK_TYPE.VIDEO_PANEL,
      targetType: 'InspirationVideoCreation',
      targetId: 'creation-1',
    })) as { creationId: string; videoUrl: string }

    expect(utilsMock.resolveVideoSourceFromGeneration).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        modelId: 'maas-seedance::doubao-seedance-2.0',
        options: expect.objectContaining({
          prompt: 'A slow camera push through a rainy neon street',
          referenceImages: ['https://app.example/api/storage/proxy?key=inspiration%2Freference.jpg&expires=proxy'],
          referenceAudios: ['https://app.example/api/storage/proxy?key=inspiration%2Freference.mp3&expires=proxy'],
          generateAudio: true,
        }),
      }),
    )
    expect(utilsMock.uploadVideoSourceToCos).toHaveBeenCalledWith(
      'https://provider.example/video.mp4',
      'inspiration-video',
      'creation-1',
      undefined,
    )
    expect(prismaMock.inspirationVideoCreation.update).toHaveBeenCalledWith({
      where: { id: 'creation-1' },
      data: { outputVideoKey: 'inspiration-video/result.mp4' },
    })
    expect(result).toEqual({
      creationId: 'creation-1',
      videoUrl: 'inspiration-video/result.mp4',
      metadata: { durationMs: 5000, width: 1280, height: 720, fps: 30 },
    })
    expect(prismaMock.novelPromotionPanel.update).not.toHaveBeenCalled()
  })

  it('VIDEO_PANEL: MAAS sends a registered active storyboard material as an asset URI', async () => {
    const processor = workerState.processor
    expect(processor).toBeTruthy()
    modelContractMock.parseModelKeyStrict.mockReturnValue({ provider: 'maas-seedance' })
    prismaMock.novelPromotionPanel.findUnique.mockResolvedValueOnce(buildPanel({
      imageUrl: 'cos/face-panel.png',
      mobileCloudAssetId: 'asset-face-1',
      mobileCloudAssetSourceUrl: 'cos/face-panel.png',
    }))
    mobileCloudAssetClientMock.getAsset.mockResolvedValueOnce({
      assetId: 'asset-face-1',
      assetName: 'face panel',
      assetType: 'Image',
      status: 'ACTIVE',
      groupId: 'group-1',
      assetUrl: 'https://mobile-cloud.example/face.png',
    })

    await processor!(buildJob({
      type: TASK_TYPE.VIDEO_PANEL,
      payload: { videoModel: 'maas-seedance::doubao-seedance-2.0' },
    }))

    expect(mobileCloudAssetClientMock.getAsset).toHaveBeenCalledWith('asset-face-1')
    expect(utilsMock.resolveVideoSourceFromGeneration).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ imageUrl: 'asset://asset-face-1' }),
    )
    expect(outboundImageMock.normalizeToOriginalMediaUrl).not.toHaveBeenCalled()
    expect(prismaMock.novelPromotionPanel.update).toHaveBeenCalledWith({
      where: { id: 'panel-1' },
      data: expect.objectContaining({
        mobileCloudAssetStatus: 'ACTIVE',
        mobileCloudAssetSyncedAt: expect.any(Date),
      }),
    })
  })

  it('VIDEO_PANEL: MAAS waits for a registered storyboard material to become active', async () => {
    const processor = workerState.processor
    expect(processor).toBeTruthy()
    modelContractMock.parseModelKeyStrict.mockReturnValue({ provider: 'maas-seedance' })
    prismaMock.novelPromotionPanel.findUnique.mockResolvedValueOnce(buildPanel({
      imageUrl: 'cos/face-panel.png',
      mobileCloudAssetId: 'asset-face-1',
      mobileCloudAssetSourceUrl: 'cos/face-panel.png',
    }))
    mobileCloudAssetClientMock.getAsset.mockResolvedValueOnce({
      assetId: 'asset-face-1',
      assetName: 'face panel',
      assetType: 'Image',
      status: 'PROCESSING',
      groupId: 'group-1',
      assetUrl: 'https://mobile-cloud.example/face.png',
    })

    await expect(processor!(buildJob({
      type: TASK_TYPE.VIDEO_PANEL,
      payload: { videoModel: 'maas-seedance::doubao-seedance-2.0' },
    }))).rejects.toThrow('MOBILE_CLOUD_PANEL_ASSET_PROCESSING')
    expect(utilsMock.resolveVideoSourceFromGeneration).not.toHaveBeenCalled()
  })

  it('VIDEO_PANEL: falls back to the global resolution and preserves a panel override', async () => {
    const processor = workerState.processor
    expect(processor).toBeTruthy()

    await processor!(buildJob({
      type: TASK_TYPE.VIDEO_PANEL,
      payload: { videoModel: 'maas-seedance::doubao-seedance-2.0' },
    }))

    expect(utilsMock.resolveVideoSourceFromGeneration).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        options: expect.objectContaining({ resolution: '720p' }),
      }),
    )

    await processor!(buildJob({
      type: TASK_TYPE.VIDEO_PANEL,
      payload: {
        videoModel: 'maas-seedance::doubao-seedance-2.0',
        generationOptions: { resolution: '1080p' },
      },
    }))

    expect(utilsMock.resolveVideoSourceFromGeneration).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        options: expect.objectContaining({ resolution: '1080p' }),
      }),
    )
  })
})
