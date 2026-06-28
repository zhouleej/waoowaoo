import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../helpers/request'

const authMock = vi.hoisted(() => ({
  requireUserAuth: vi.fn(async () => ({
    session: { user: { id: 'user-1' } },
  })),
  isErrorResponse: vi.fn((value: unknown) => value instanceof Response),
  badRequest: vi.fn((message: string) => Response.json({ error: { message } }, { status: 400 })),
}))

const permissionMock = vi.hoisted(() => ({
  requireOrganizationRole: vi.fn(),
}))

const prismaMock = vi.hoisted(() => ({
  organizationMember: {
    findMany: vi.fn(),
  },
  userPreference: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
}))

vi.mock('@/lib/api-auth', () => authMock)
vi.mock('@/lib/saas/permissions', () => permissionMock)
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

describe('api organizations current route', () => {
  const routeContext = { params: Promise.resolve({}) }

  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.organizationMember.findMany.mockResolvedValue([
      {
        id: 'member-1',
        organizationId: 'org-1',
        userId: 'user-1',
        role: 'member',
        status: 'active',
        joinedAt: new Date('2026-01-01T00:00:00Z'),
        organization: {
          id: 'org-1',
          name: 'Org 1',
          slug: 'org-1',
          status: 'active',
          businessStatus: 'trial',
        },
      },
      {
        id: 'member-2',
        organizationId: 'org-2',
        userId: 'user-1',
        role: 'admin',
        status: 'active',
        joinedAt: new Date('2026-01-02T00:00:00Z'),
        organization: {
          id: 'org-2',
          name: 'Org 2',
          slug: 'org-2',
          status: 'active',
          businessStatus: 'paid',
        },
      },
    ])
    prismaMock.userPreference.findUnique.mockResolvedValue({ currentOrganizationId: 'org-2' })
    prismaMock.userPreference.upsert.mockResolvedValue({ userId: 'user-1', currentOrganizationId: 'org-2' })
    permissionMock.requireOrganizationRole.mockResolvedValue({
      error: null,
      membership: {
        id: 'member-2',
        organizationId: 'org-2',
        userId: 'user-1',
        role: 'admin',
        status: 'active',
        joinedAt: new Date('2026-01-02T00:00:00Z'),
        organization: {
          id: 'org-2',
          name: 'Org 2',
          slug: 'org-2',
          status: 'active',
          businessStatus: 'paid',
        },
      },
    })
  })

  it('returns the saved current organization when it is still an active membership', async () => {
    const mod = await import('@/app/api/organizations/current/route')
    const res = await mod.GET(buildMockRequest({ path: '/api/organizations/current', method: 'GET' }), routeContext)
    const body = await res.json() as { currentOrganization?: { organizationId?: string } }

    expect(res.status).toBe(200)
    expect(body.currentOrganization?.organizationId).toBe('org-2')
  })

  it('switches current organization only after membership revalidation', async () => {
    const mod = await import('@/app/api/organizations/current/route')
    const res = await mod.POST(
      buildMockRequest({
        path: '/api/organizations/current',
        method: 'POST',
        body: { organizationId: 'org-2' },
      }),
      routeContext,
    )

    expect(res.status).toBe(200)
    expect(permissionMock.requireOrganizationRole).toHaveBeenCalledWith('org-2', 'user-1', ['owner', 'admin', 'member'])
    expect(prismaMock.userPreference.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'user-1' },
      update: { currentOrganizationId: 'org-2' },
    }))
  })

  it('rejects switching to an organization the user cannot access', async () => {
    permissionMock.requireOrganizationRole.mockResolvedValueOnce({
      error: Response.json({ error: 'forbidden' }, { status: 403 }),
      membership: null,
    })

    const mod = await import('@/app/api/organizations/current/route')
    const res = await mod.POST(
      buildMockRequest({
        path: '/api/organizations/current',
        method: 'POST',
        body: { organizationId: 'org-x' },
      }),
      routeContext,
    )

    expect(res.status).toBe(403)
    expect(prismaMock.userPreference.upsert).not.toHaveBeenCalled()
  })
})
