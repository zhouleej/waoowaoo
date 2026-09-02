import fs from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const prismaMock = vi.hoisted(() => ({
  organizationMember: {
    findUnique: vi.fn(),
  },
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/api-auth', () => ({
  forbidden: (message: string) => Response.json({ error: message }, { status: 403 }),
  notFound: (resource: string) => Response.json({ error: `${resource} not found` }, { status: 404 }),
}))

function readProjectFile(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')
}

function activeMembership(overrides: Record<string, unknown> = {}) {
  return {
    id: 'membership-1',
    organizationId: 'org-1',
    userId: 'admin-1',
    role: 'admin',
    status: 'active',
    organization: { id: 'org-1', status: 'active' },
    ...overrides,
  }
}

describe('organization role boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.organizationMember.findUnique.mockResolvedValue(activeMembership())
  })

  it('allows an active organization admin to manage ordinary organization members', async () => {
    const { requireOrganizationRole } = await import('@/lib/saas/permissions')

    const result = await requireOrganizationRole('org-1', 'admin-1', ['owner', 'admin'])

    expect(result.error).toBeNull()
    expect(result.membership?.role).toBe('admin')
    expect(prismaMock.organizationMember.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId_userId: { organizationId: 'org-1', userId: 'admin-1' } },
      include: { organization: true },
    }))
  })

  it.each([
    ['frozen actor', activeMembership({ status: 'frozen' })],
    ['disabled organization', activeMembership({ organization: { id: 'org-1', status: 'disabled' } })],
  ])('rejects a %s before organization actions', async (_label, membership) => {
    prismaMock.organizationMember.findUnique.mockResolvedValueOnce(membership)
    const { requireOrganizationRole } = await import('@/lib/saas/permissions')

    const result = await requireOrganizationRole('org-1', 'admin-1', ['owner', 'admin'])

    expect(result.error?.status).toBe(403)
  })

  it('denies a normal member from member-management roles', async () => {
    prismaMock.organizationMember.findUnique.mockResolvedValueOnce(activeMembership({ role: 'member' }))
    const { requireOrganizationRole } = await import('@/lib/saas/permissions')

    const result = await requireOrganizationRole('org-1', 'member-1', ['owner', 'admin'])

    expect(result.error?.status).toBe(403)
  })

  it('routes ordinary organization reads and member mutations through the same active-role boundary', () => {
    const routes = [
      'src/app/api/organizations/[id]/route.ts',
      'src/app/api/organizations/[id]/members/route.ts',
      'src/app/api/organizations/[id]/members/[userId]/route.ts',
      'src/app/api/organizations/[id]/balance/route.ts',
      'src/app/api/organizations/[id]/usage/route.ts',
      'src/app/api/organizations/[id]/members/[userId]/usage/route.ts',
    ]

    for (const route of routes) {
      const source = readProjectFile(route)
      expect(source, route).toContain('requireOrganizationRole')
      expect(source, route).not.toContain('checkOrganizationManagePermission')
    }
  })

  it('keeps platform administrator access intentionally separate from organization membership', () => {
    const source = readProjectFile('src/app/api/platform/organizations/[id]/members/route.ts')

    expect(source).toContain('requirePlatformAdmin')
    expect(source).not.toContain('requireOrganizationRole')
  })

  it('returns the active caller role and allows admins to promote ordinary members only', () => {
    const detailRoute = readProjectFile('src/app/api/organizations/[id]/route.ts')
    const detailPage = readProjectFile('src/app/[locale]/admin/organizations/[id]/page.tsx')

    expect(detailRoute).toContain('currentUserRole: permission.membership!.role')
    expect(detailRoute).toContain('currentUserStatus: permission.membership!.status')
    expect(detailPage).toContain("(isOwner || (isAdmin && m.role === 'member'))")
    expect(detailPage).toContain("handleRoleChange(m.user.id, 'admin')")
    expect(detailPage).toContain("t('promoteToAdmin')")
    expect(detailPage).toContain("(isOwner || m.role === 'member')")
    expect(detailPage).toContain("status: m.status === 'active' ? 'frozen' : 'active'")
  })
})
