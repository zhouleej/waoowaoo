import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

const prismaMock = vi.hoisted(() => ({
  customArtStyle: {
    findMany: vi.fn(), create: vi.fn(), updateMany: vi.fn(), findFirstOrThrow: vi.fn(), deleteMany: vi.fn(),
  },
}))

vi.mock('@/lib/api-auth', () => ({
  isErrorResponse: (value: unknown) => value instanceof Response,
  requireUserAuth: async () => ({ session: { user: { id: 'user-1' } } }),
}))
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

describe('api specific - asset hub custom styles', () => {
  const id = '11111111-1111-4111-8111-111111111111'
  beforeEach(() => vi.clearAllMocks())

  it('lists only the current user styles with namespaced values', async () => {
    prismaMock.customArtStyle.findMany.mockResolvedValue([{ id, userId: 'user-1', name: '童话', prompt: 'warm' }])
    const mod = await import('@/app/api/asset-hub/styles/route')
    const res = await mod.GET(buildMockRequest({ path: '/api/asset-hub/styles', method: 'GET' }), { params: Promise.resolve({}) })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ styles: [{ value: `custom:${id}`, name: '童话' }] })
    expect(prismaMock.customArtStyle.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'user-1' } }))
  })

  it('creates trimmed styles owned by the current user', async () => {
    prismaMock.customArtStyle.create.mockResolvedValue({ id, userId: 'user-1', name: '童话', prompt: 'warm' })
    const mod = await import('@/app/api/asset-hub/styles/route')
    const req = buildMockRequest({ path: '/api/asset-hub/styles', method: 'POST', body: { name: ' 童话 ', prompt: ' warm ' } })
    const res = await mod.POST(req, { params: Promise.resolve({}) })
    expect(res.status).toBe(201)
    expect(prismaMock.customArtStyle.create).toHaveBeenCalledWith({ data: { userId: 'user-1', name: '童话', prompt: 'warm' } })
  })

  it('scopes deletion to the current user', async () => {
    prismaMock.customArtStyle.deleteMany.mockResolvedValue({ count: 1 })
    const mod = await import('@/app/api/asset-hub/styles/[styleId]/route')
    const req = buildMockRequest({ path: `/api/asset-hub/styles/${id}`, method: 'DELETE' })
    const res = await mod.DELETE(req, { params: Promise.resolve({ styleId: id }) })
    expect(res.status).toBe(200)
    expect(prismaMock.customArtStyle.deleteMany).toHaveBeenCalledWith({ where: { id, userId: 'user-1' } })
  })

  it('updates only a style owned by the current user', async () => {
    prismaMock.customArtStyle.updateMany.mockResolvedValue({ count: 1 })
    prismaMock.customArtStyle.findFirstOrThrow.mockResolvedValue({ id, userId: 'user-1', name: '水墨', prompt: 'ink wash' })
    const mod = await import('@/app/api/asset-hub/styles/[styleId]/route')
    const req = buildMockRequest({ path: `/api/asset-hub/styles/${id}`, method: 'PATCH', body: { name: ' 水墨 ', prompt: ' ink wash ' } })
    const res = await mod.PATCH(req, { params: Promise.resolve({ styleId: id }) })
    expect(res.status).toBe(200)
    expect(prismaMock.customArtStyle.updateMany).toHaveBeenCalledWith({
      where: { id, userId: 'user-1' }, data: { name: '水墨', prompt: 'ink wash' },
    })
  })
})
