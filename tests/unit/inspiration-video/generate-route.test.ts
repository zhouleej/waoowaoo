import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { TASK_TYPE } from '@/lib/task/types'

const authState = vi.hoisted(() => ({ authenticated: true }))
const submitTaskMock = vi.hoisted(() => vi.fn())
const storageMock = vi.hoisted(() => ({
  uploadObject: vi.fn(async (_body: Buffer, key: string) => key),
  deleteObjects: vi.fn(async () => ({ deleted: [], failed: [] })),
  generateUniqueKey: vi.fn((prefix: string, extension: string) => `${prefix}.${extension}`),
}))
const prismaMock = vi.hoisted(() => ({
  inspirationVideoCreation: {
    create: vi.fn(async () => ({ id: 'creation-1' })),
    update: vi.fn(async () => ({ id: 'creation-1', taskId: 'task-1' })),
    deleteMany: vi.fn(async () => ({ count: 1 })),
  },
  inspirationVideoAsset: {
    createMany: vi.fn(async () => ({ count: 3 })),
  },
}))

vi.mock('@/lib/api-auth', () => ({
  isErrorResponse: (value: unknown) => value instanceof Response,
  requireUserAuth: async () => authState.authenticated
    ? { session: { user: { id: 'user-1' } } }
    : new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 }),
}))
vi.mock('@/lib/api-config', () => ({
  getProviderKey: (provider?: string) => provider?.split(':')[0] || '',
  resolveModelSelection: vi.fn(async () => ({
    provider: 'maas-seedance',
    modelId: 'doubao-seedance-2.0',
    modelKey: 'maas-seedance::doubao-seedance-2.0',
    mediaType: 'video',
  })),
}))
vi.mock('@/lib/config-service', () => ({
  resolveProjectModelCapabilityGenerationOptions: vi.fn(async () => ({
    duration: 5,
    resolution: '720p',
    generationMode: 'normal',
    generateAudio: true,
  })),
}))
vi.mock('@/lib/model-capabilities/lookup', () => ({
  resolveBuiltinCapabilitiesByModelKey: vi.fn(() => ({
    video: { generateAudioOptions: [true, false], textToVideo: true },
  })),
}))
vi.mock('@/lib/inspiration-video/workspace', () => ({
  resolveInspirationVideoWorkspace: vi.fn(async () => ({
    workspace: { id: 'workspace-1', projectId: 'project-1' },
    organizationId: null,
  })),
}))
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/storage', () => storageMock)
vi.mock('@/lib/task/submitter', () => ({ submitTask: submitTaskMock }))
vi.mock('sharp', () => ({
  default: vi.fn(() => ({
    rotate() { return this },
    jpeg() { return this },
    async toBuffer() { return Buffer.from('normalized-image') },
  })),
}))

function createRequest(options?: { references?: boolean; textOnly?: boolean }): NextRequest {
  const formData = new FormData()
  formData.set('prompt', 'A cinematic rainy neon street')
  formData.set('modelKey', 'maas-seedance::doubao-seedance-2.0')
  formData.set('aspectRatio', '16:9')
  formData.set('resolution', '720p')
  formData.set('duration', '5')
  formData.set('generateAudio', 'true')
  formData.set('locale', 'zh')
  if (!options?.textOnly) formData.set('primaryImage', new File(['primary'], 'primary.png', { type: 'image/png' }))
  if (options?.references !== false) {
    formData.append('referenceImages', new File(['reference'], 'reference.webp', { type: 'image/webp' }))
    formData.append('referenceAudios', new File(['audio'], 'reference.mp3', { type: 'audio/mpeg' }))
  }
  return new NextRequest('http://localhost/api/inspiration-video/generate', {
    method: 'POST',
    body: formData,
  })
}

describe('inspiration video generate route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState.authenticated = true
    submitTaskMock.mockResolvedValue({ success: true, async: true, taskId: 'task-1', status: 'queued' })
  })

  it('submits text without uploading an image for a capable model', async () => {
    const { POST } = await import('@/app/api/inspiration-video/generate/route')
    const response = await POST(createRequest({ textOnly: true, references: false }), { params: Promise.resolve({}) })
    expect(response.status).toBe(202)
    expect(storageMock.uploadObject).not.toHaveBeenCalled()
    expect(submitTaskMock).toHaveBeenCalledWith(expect.objectContaining({ targetType: 'InspirationVideoCreation' }))
  })

  it('uploads all materials, submits a video task, and links the task to the creation', async () => {
    const { POST } = await import('@/app/api/inspiration-video/generate/route')
    const response = await POST(createRequest(), { params: Promise.resolve({}) })

    expect(response.status).toBe(202)
    expect(storageMock.uploadObject).toHaveBeenCalledTimes(3)
    expect(prismaMock.inspirationVideoAsset.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.arrayContaining([
        expect.objectContaining({ kind: 'primary_image' }),
        expect.objectContaining({ kind: 'reference_image' }),
        expect.objectContaining({ kind: 'reference_audio' }),
      ]),
    }))
    expect(submitTaskMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      projectId: 'project-1',
      type: TASK_TYPE.VIDEO_PANEL,
      targetType: 'InspirationVideoCreation',
      targetId: 'creation-1',
      payload: expect.objectContaining({
        videoModel: 'maas-seedance::doubao-seedance-2.0',
        generationOptions: expect.objectContaining({ generateAudio: true }),
      }),
    }))
    expect(prismaMock.inspirationVideoCreation.update).toHaveBeenCalledWith({
      where: { id: 'creation-1' },
      data: { taskId: 'task-1' },
    })
  })

  it('returns 401 before creating or uploading when unauthenticated', async () => {
    authState.authenticated = false
    const { POST } = await import('@/app/api/inspiration-video/generate/route')
    const response = await POST(createRequest(), { params: Promise.resolve({}) })

    expect(response.status).toBe(401)
    expect(prismaMock.inspirationVideoCreation.create).not.toHaveBeenCalled()
    expect(storageMock.uploadObject).not.toHaveBeenCalled()
  })

  it('removes the creation and uploaded objects when task submission fails', async () => {
    submitTaskMock.mockRejectedValueOnce(new Error('queue unavailable'))
    const { POST } = await import('@/app/api/inspiration-video/generate/route')
    const response = await POST(createRequest(), { params: Promise.resolve({}) })

    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(prismaMock.inspirationVideoCreation.deleteMany).toHaveBeenCalledWith({ where: { id: 'creation-1' } })
    expect(storageMock.deleteObjects).toHaveBeenCalledWith([
      'inspiration-video/creation-1/primary_image-0.jpg',
      'inspiration-video/creation-1/reference_image-0.jpg',
      'inspiration-video/creation-1/reference_audio-0.mp3',
    ])
  })
})
