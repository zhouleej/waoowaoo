import { describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const deliveryMock = vi.hoisted(() => vi.fn(() => ({
  videoUrl: '/api/storage/sign?key=output.mp4',
  videoFallbackUrl: '/api/storage/proxy?key=output.mp4',
  downloadUrl: '/api/storage/proxy?key=output.mp4&disposition=attachment',
})))

vi.mock('@/lib/api-auth', () => ({
  isErrorResponse: (value: unknown) => value instanceof Response,
  requireUserAuth: async () => ({ session: { user: { id: 'user-1' } } }),
}))
vi.mock('@/lib/inspiration-video/workspace', () => ({
  resolveInspirationVideoWorkspace: async () => ({
    workspace: { id: 'workspace-1', projectId: 'project-1' },
  }),
}))
vi.mock('@/lib/inspiration-video/actions', () => ({ actOnCreation: vi.fn() }))
vi.mock('@/lib/inspiration-video/media-delivery', () => ({
  buildInspirationVideoDeliveryUrls: deliveryMock,
}))
vi.mock('@/lib/storage', () => ({
  getStorageProxyUrl: (key: string) => `/api/storage/proxy?key=${key}`,
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    userPreference: { findUnique: async () => null },
    inspirationVideoCreation: {
      findMany: async () => [{
        id: 'creation-1',
        workspaceId: 'workspace-1',
        prompt: 'A cinematic sunrise',
        modelKey: 'provider::video-model',
        aspectRatio: '16:9',
        resolution: '720p',
        duration: 5,
        generateAudio: true,
        outputVideoKey: 'images/inspiration-video-creation-1.mp4',
        createdAt: new Date('2026-09-14T00:00:00.000Z'),
        assets: [{
          id: 'primary-1',
          kind: 'primary_image',
          storageKey: 'images/primary.jpg',
          originalName: 'primary.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 100,
          sortOrder: 0,
        }],
      }],
    },
    task: {
      findMany: async () => [{
        id: 'task-1',
        targetId: 'creation-1',
        status: 'completed',
        progress: 100,
        errorCode: null,
        errorMessage: null,
        result: null,
        billingInfo: null,
      }],
    },
  },
}))

describe('GET /api/inspiration-video media delivery', () => {
  it('returns direct storage playback with a same-origin fallback', async () => {
    const { GET } = await import('@/app/api/inspiration-video/route')
    const request = new NextRequest('http://localhost/api/inspiration-video')
    const response = await GET(request, { params: Promise.resolve({}) })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(deliveryMock).toHaveBeenCalledWith(
      'images/inspiration-video-creation-1.mp4',
      '灵感视频_creation-1.mp4',
    )
    expect(body.creations[0]).toMatchObject({
      videoUrl: '/api/storage/sign?key=output.mp4',
      videoFallbackUrl: '/api/storage/proxy?key=output.mp4',
      downloadUrl: '/api/storage/proxy?key=output.mp4&disposition=attachment',
    })
  })
})
