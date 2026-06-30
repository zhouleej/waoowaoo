import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

function evaluateGuard<T>(expression: string): T {
  const modulePath = resolve(process.cwd(), 'scripts/guards/api-route-contract-guard.mjs')
  const script = `
    const { pathToFileURL } = await import('node:url')
    const mod = await import(pathToFileURL(${JSON.stringify(modulePath)}).href)
    const result = ${expression}
    process.stdout.write(JSON.stringify(result))
  `
  return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' })) as T
}

function inspectRouteContract(relPath: string, content: string): string[] {
  return evaluateGuard<string[]>(`mod.inspectRouteContract(${JSON.stringify(relPath)}, ${JSON.stringify(content)})`)
}

describe('api route contract guard', () => {
  it('allows explicit public and framework-managed exceptions', () => {
    expect(evaluateGuard<boolean>(`mod.API_HANDLER_ALLOWLIST.has('src/app/api/auth/[...nextauth]/route.ts')`)).toBe(true)
    expect(evaluateGuard<boolean>(`mod.PUBLIC_ROUTE_ALLOWLIST.has('src/app/api/system/boot-id/route.ts')`)).toBe(true)
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
      'src/app/api/user/secure/route.ts missing requireUserAuth/requireProjectAuth/requireProjectAuthLight/requirePlatformAdmin/checkPlatformAdmin',
    ])
  })
})
