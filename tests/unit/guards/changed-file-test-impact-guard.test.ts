import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

function inspectChangedFiles(files: string[]): string[] {
  const modulePath = resolve(process.cwd(), 'scripts/guards/changed-file-test-impact-guard.mjs')
  const script = `
    const { pathToFileURL } = await import('node:url')
    const mod = await import(pathToFileURL(${JSON.stringify(modulePath)}).href)
    const result = mod.inspectChangedFiles(${JSON.stringify(files)})
    process.stdout.write(JSON.stringify(result))
  `
  return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' })) as string[]
}

describe('changed-file-test-impact-guard', () => {
  it('requires api changes to be paired with contract, system, or regression tests', () => {
    const violations = inspectChangedFiles([
      'src/app/api/novel-promotion/[projectId]/generate-image/route.ts',
    ])
    expect(violations).toEqual([
      'api: changing src/app/api/** requires a matching contract, system, or regression test change; sources=src/app/api/novel-promotion/[projectId]/generate-image/route.ts',
    ])
  })

  it('accepts worker changes when system tests are updated together', () => {
    const violations = inspectChangedFiles([
      'src/lib/workers/image.worker.ts',
      'tests/system/generate-image.system.test.ts',
    ])
    expect(violations).toEqual([])
  })

  it('accepts provider changes when provider contract coverage is updated', () => {
    const violations = inspectChangedFiles([
      'src/lib/model-gateway/openai-compat/image.ts',
      'tests/unit/model-gateway/openai-compat-template-image-output-urls.test.ts',
    ])
    expect(violations).toEqual([])
  })
})
