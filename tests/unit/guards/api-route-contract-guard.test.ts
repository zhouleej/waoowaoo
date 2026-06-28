import { beforeAll, describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'

let API_HANDLER_ALLOWLIST: Set<string>
let PUBLIC_ROUTE_ALLOWLIST: Set<string>
let inspectRouteContract: (relPath: string, content: string) => string[]

beforeAll(async () => {
  const require = createRequire(import.meta.url)
  const guard = require('../../../scripts/guards/api-route-contract-guard-core.cjs') as {
    API_HANDLER_ALLOWLIST: Set<string>
    PUBLIC_ROUTE_ALLOWLIST: Set<string>
    inspectRouteContract: (relPath: string, content: string) => string[]
  }
  API_HANDLER_ALLOWLIST = guard.API_HANDLER_ALLOWLIST
  PUBLIC_ROUTE_ALLOWLIST = guard.PUBLIC_ROUTE_ALLOWLIST
  inspectRouteContract = guard.inspectRouteContract
})

describe('api route contract guard', () => {
  it('allows explicit public and framework-managed exceptions', () => {
    expect(API_HANDLER_ALLOWLIST.has('src/app/api/auth/[...nextauth]/route.ts')).toBe(true)
    expect(PUBLIC_ROUTE_ALLOWLIST.has('src/app/api/system/boot-id/route.ts')).toBe(true)
    expect(
      inspectRouteContract(
        'src/app/api/system/boot-id/route.ts',
        'export async function GET() { return Response.json({ bootId: "x" }) }',
      ),
    ).toEqual([])
  })

  it('passes protected routes that use apiHandler and explicit auth', () => {
    const content = `
      import { requireUserAuth } from '@/lib/api-auth'
      import { apiHandler } from '@/lib/api-errors'
      export const GET = apiHandler(async () => {
        await requireUserAuth()
        return Response.json({ ok: true })
      })
    `

    expect(inspectRouteContract('src/app/api/user/secure/route.ts', content)).toEqual([])
  })

  it('passes platform routes that use apiHandler and platform admin auth', () => {
    const content = `
      import { requirePlatformAdmin } from '@/lib/platform-admin'
      import { apiHandler } from '@/lib/api-errors'
      export const GET = apiHandler(async () => {
        await requirePlatformAdmin()
        return Response.json({ ok: true })
      })
    `

    expect(inspectRouteContract('src/app/api/platform/secure/route.ts', content)).toEqual([])
  })

  it('passes platform admin check routes that use apiHandler and platform admin check auth', () => {
    const content = `
      import { checkPlatformAdmin } from '@/lib/platform-admin'
      import { apiHandler } from '@/lib/api-errors'
      export const GET = apiHandler(async () => {
        const result = await checkPlatformAdmin()
        return Response.json(result)
      })
    `

    expect(inspectRouteContract('src/app/api/platform/admin/check/route.ts', content)).toEqual([])
  })

  it('passes organization routes that use apiHandler and organization role auth', () => {
    const content = `
      import { requireOrganizationRole } from '@/lib/saas/permissions'
      import { apiHandler } from '@/lib/api-errors'
      export const GET = apiHandler(async () => {
        await requireOrganizationRole('org-1', 'user-1', ['member'])
        return Response.json({ ok: true })
      })
    `

    expect(inspectRouteContract('src/app/api/organizations/secure/route.ts', content)).toEqual([])
  })

  it('flags protected routes that skip apiHandler or auth', () => {
    const missingApiHandler = `
      import { requireUserAuth } from '@/lib/api-auth'
      export async function GET() {
        await requireUserAuth()
        return Response.json({ ok: true })
      }
    `
    const missingAuth = `
      import { apiHandler } from '@/lib/api-errors'
      export const GET = apiHandler(async () => Response.json({ ok: true }))
    `

    expect(inspectRouteContract('src/app/api/user/secure/route.ts', missingApiHandler)).toEqual([
      'src/app/api/user/secure/route.ts missing apiHandler wrapper',
    ])
    expect(inspectRouteContract('src/app/api/user/secure/route.ts', missingAuth)).toEqual([
      'src/app/api/user/secure/route.ts missing requireUserAuth/requireProjectAuth/requireProjectAuthLight/requirePlatformAdmin/checkPlatformAdmin/requireOrganizationRole',
    ])
  })
})
