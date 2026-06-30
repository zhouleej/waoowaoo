import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

function inspectTaskSubmitCompensation(relPath: string, content: string): string[] {
  const modulePath = resolve(process.cwd(), 'scripts/guards/task-submit-compensation-guard.mjs')
  const script = `
    const { pathToFileURL } = await import('node:url')
    const mod = await import(pathToFileURL(${JSON.stringify(modulePath)}).href)
    const result = mod.inspectTaskSubmitCompensation(${JSON.stringify(relPath)}, ${JSON.stringify(content)})
    process.stdout.write(JSON.stringify(result))
  `
  return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' })) as string[]
}

describe('task submit compensation guard', () => {
  it('passes routes that create data before submitTask and define rollback handling', () => {
    const content = `
      async function rollbackCreatedRecord() {}
      export const POST = apiHandler(async () => {
        await prisma.panel.create({ data: {} })
        try {
          return await submitTask({})
        } catch (error) {
          await rollbackCreatedRecord()
          throw error
        }
      })
    `

    expect(
      inspectTaskSubmitCompensation('src/app/api/novel-promotion/[projectId]/panel-variant/route.ts', content),
    ).toEqual([])
  })

  it('ignores routes that do not combine create and submitTask', () => {
    expect(inspectTaskSubmitCompensation('src/app/api/user/api-config/route.ts', 'await submitTask({})')).toEqual([])
    expect(inspectTaskSubmitCompensation('src/app/api/projects/route.ts', 'await prisma.project.create({ data: {} })')).toEqual([])
  })

  it('flags routes that create data before submitTask without compensation marker', () => {
    const content = `
      export const POST = apiHandler(async () => {
        await prisma.panel.create({ data: {} })
        return await submitTask({})
      })
    `

    expect(
      inspectTaskSubmitCompensation('src/app/api/example/route.ts', content),
    ).toEqual([
      'src/app/api/example/route.ts creates data before submitTask without explicit rollback/compensation marker',
    ])
  })
})
