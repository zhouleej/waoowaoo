import fs from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../helpers/request'
import { ROUTE_CATALOG } from '../../contracts/route-catalog'

const authState = vi.hoisted(() => ({
  mode: 'admin' as 'admin' | 'unauthorized' | 'forbidden',
}))

const requirePlatformAdminMock = vi.hoisted(() => vi.fn())

const prismaMock = vi.hoisted(() => ({
  organizationMember: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
  },
}))

vi.mock('@/lib/platform-admin', async () => {
  const { NextResponse } = await vi.importActual<typeof import('next/server')>('next/server')

  return {
    requirePlatformAdmin: requirePlatformAdminMock.mockImplementation(async () => {
      if (authState.mode === 'unauthorized') {
        return NextResponse.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 })
      }
      if (authState.mode === 'forbidden') {
        return NextResponse.json({ error: { code: 'FORBIDDEN' } }, { status: 403 })
      }
      return {
        session: { user: { id: 'platform-admin' } },
        user: { id: 'platform-admin', name: 'Platform Admin', email: 'admin@example.com' },
      }
    }),
  }
})

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))

vi.mock('@/lib/prisma-retry', () => ({
  withPrismaRetry: async <T>(operation: () => Promise<T>) => operation(),
}))

vi.mock('@/lib/api-errors', () => ({
  apiHandler:
    <TParams extends Record<string, string>>(handler: (req: Request, ctx: { params: Promise<TParams> }) => Promise<Response>) =>
      async (req: Request, ctx: { params: Promise<TParams> }) => handler(req, ctx),
}))

function readProjectFile(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')
}

const PLATFORM_PAGE_FILES = [
  'src/app/[locale]/admin/platform/page.tsx',
  'src/app/[locale]/admin/platform/stats/page.tsx',
  'src/app/[locale]/admin/platform/audit/page.tsx',
  'src/app/[locale]/admin/platform/config/page.tsx',
  'src/app/[locale]/admin/platform/organizations/page.tsx',
  'src/app/[locale]/admin/platform/users/page.tsx',
  'src/app/[locale]/admin/platform/billing/page.tsx',
]

describe('platform organization members route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState.mode = 'admin'
    prismaMock.organizationMember.findMany.mockResolvedValue([
      {
        id: 'member-1',
        organizationId: 'org-1',
        userId: 'user-1',
        role: 'member',
        quota: 0,
        status: 'active',
        joinedAt: '2026-06-28T00:00:00.000Z',
        user: {
          id: 'user-1',
          name: 'User One',
          email: 'user@example.com',
          image: null,
        },
      },
    ])
  })

  it('lets a platform admin list organization members without an organization membership check', async () => {
    const route = await import('@/app/api/platform/organizations/[id]/members/route')
    const req = buildMockRequest({
      path: '/api/platform/organizations/org-1/members',
      method: 'GET',
    })

    const res = await route.GET(req, { params: Promise.resolve({ id: 'org-1' }) })

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual([
      expect.objectContaining({
        id: 'member-1',
        organizationId: 'org-1',
        user: expect.objectContaining({ email: 'user@example.com' }),
      }),
    ])
    expect(requirePlatformAdminMock).toHaveBeenCalledTimes(1)
    expect(prismaMock.organizationMember.findUnique).not.toHaveBeenCalled()
    expect(prismaMock.organizationMember.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId: 'org-1' },
    }))
  })

  it('rejects unauthenticated or non-platform-admin users before querying members', async () => {
    const route = await import('@/app/api/platform/organizations/[id]/members/route')
    const req = buildMockRequest({
      path: '/api/platform/organizations/org-1/members',
      method: 'GET',
    })

    authState.mode = 'unauthorized'
    const unauthorized = await route.GET(req, { params: Promise.resolve({ id: 'org-1' }) })
    expect(unauthorized.status).toBe(401)

    authState.mode = 'forbidden'
    const forbidden = await route.GET(req, { params: Promise.resolve({ id: 'org-1' }) })
    expect(forbidden.status).toBe(403)

    expect(prismaMock.organizationMember.findMany).not.toHaveBeenCalled()
  })
})

describe('platform admin frontend wiring', () => {
  it('tracks the new platform members route in the route catalog', () => {
    expect(ROUTE_CATALOG.map((entry) => entry.routeFile)).toContain(
      'src/app/api/platform/organizations/[id]/members/route.ts',
    )
  })

  it('uses the platform members API from the platform organizations detail page', () => {
    const source = readProjectFile('src/app/[locale]/admin/platform/organizations/page.tsx')

    expect(source).toContain('/api/platform/organizations/${org.id}/members')
    expect(source).not.toContain('/api/organizations/${org.id}/members')
  })

  it('checks platform admin access through the platform admin check API in Navbar and platform entry', () => {
    const navbarSource = readProjectFile('src/components/Navbar.tsx')
    const platformPageSource = readProjectFile('src/app/[locale]/admin/platform/page.tsx')
    const hookSource = readProjectFile('src/hooks/common/usePlatformAdminCheck.ts')

    expect(navbarSource).toContain('usePlatformAdminCheck')
    expect(platformPageSource).toContain('usePlatformAdminCheck')
    expect(hookSource).toContain('/api/platform/admin/check')
    expect(navbarSource).not.toContain('(session.user as any)?.isPlatformAdmin')
  })

  it('links the system config card to the page route instead of the API route', () => {
    const source = readProjectFile('src/app/[locale]/admin/platform/page.tsx')

    expect(source).toContain("pathname: '/admin/platform/config'")
    expect(source).not.toContain('/api/platform/config')
  })

  it('surfaces platform admin check request failures without treating them as denied access', () => {
    const source = readProjectFile('src/hooks/common/usePlatformAdminCheck.ts')

    expect(source).toContain('PlatformAdminCheckError')
    expect(source).toContain("kind: 'request'")
    expect(source).toContain('error')
    expect(source).toContain('refetch')
    expect(source).toContain('retry')
    expect(source).toContain('response.status === 401 || response.status === 403')
    expect(source).toContain('setError(null)')
  })

  it('renders retryable platform page errors instead of empty data after failed requests', () => {
    for (const file of PLATFORM_PAGE_FILES) {
      const source = readProjectFile(file)

      expect(source, file).toContain('PlatformPageError')
      expect(source, file).toContain('PlatformAccessDenied')
      expect(source, file).not.toMatch(/catch\(\(\)\s*=>\s*set(?:Stats|null|Logs|Configs)\((?:null|\[\])\)\)/)
      expect(source, file).not.toContain('403 - Access Denied')
      expect(source, file).not.toMatch(/<h1[^>]*>\s*403\s*<\/h1>/)
    }
  })

  it('requires checked platform fetch responses and shared ok helpers', () => {
    const apiFetchSource = readProjectFile('src/lib/api-fetch.ts')

    expect(apiFetchSource).toContain('export async function throwIfNotOk')
    expect(apiFetchSource).toContain('export async function apiVoid')

    for (const file of PLATFORM_PAGE_FILES) {
      const source = readProjectFile(file)
      expect(source, file).not.toContain('res.ok')
      expect(source, file).not.toContain('membersRes.ok')
    }

    for (const file of [
      'src/app/[locale]/admin/platform/organizations/page.tsx',
      'src/app/[locale]/admin/platform/users/page.tsx',
      'src/app/[locale]/admin/platform/billing/page.tsx',
    ]) {
      expect(readProjectFile(file), file).toContain('throwIfNotOk')
    }
  })

  it('uses platform i18n keys for obvious admin UI literals', () => {
    const combinedPages = PLATFORM_PAGE_FILES.map(readProjectFile).join('\n')
    const zhMessages = JSON.parse(readProjectFile('messages/zh/platform.json')) as Record<string, unknown>
    const enMessages = JSON.parse(readProjectFile('messages/en/platform.json')) as Record<string, unknown>

    for (const key of [
      'accessDeniedTitle',
      'platformAdminCheckFailed',
      'requestFailed',
      'retry',
      'password',
    ]) {
      expect(zhMessages, `zh.${key}`).toHaveProperty(key)
      expect(enMessages, `en.${key}`).toHaveProperty(key)
    }

    expect(combinedPages).not.toContain('Access Denied')
    expect(combinedPages).not.toMatch(/>\s*Admin\s*</)
    expect(combinedPages).not.toMatch(/>\s*取消\s*</)
    expect(combinedPages).not.toContain('密码 *')
  })
})
