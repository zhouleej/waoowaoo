import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

function evaluateGuard<T>(expression: string): T {
  const modulePath = resolve(process.cwd(), 'scripts/guards/image-reference-normalization-guard.mjs')
  const script = `
    const { pathToFileURL } = await import('node:url')
    const mod = await import(pathToFileURL(${JSON.stringify(modulePath)}).href)
    const result = ${expression}
    process.stdout.write(JSON.stringify(result))
  `
  return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' })) as T
}

function inspectImageReferenceNormalization(relPath: string, content: string): string[] {
  return evaluateGuard<string[]>(`mod.inspectImageReferenceNormalization(${JSON.stringify(relPath)}, ${JSON.stringify(content)})`)
}

describe('image reference normalization guard', () => {
  it('allows shared helper exceptions explicitly', () => {
    expect(evaluateGuard<boolean>(`mod.NORMALIZATION_HELPER_ALLOWLIST.has('src/lib/workers/handlers/image-task-handler-shared.ts')`)).toBe(true)
    expect(
      inspectImageReferenceNormalization(
        'src/lib/workers/handlers/image-task-handler-shared.ts',
        'resolveImageSourceFromGeneration(job, { options: params.options })\nreferenceImages?: string[]',
      ),
    ).toEqual([])
  })

  it('passes handlers that normalize reference images before generation', () => {
    const content = `
      import { normalizeReferenceImagesForGeneration } from '@/lib/media/outbound-image'
      async function run() {
        const normalizedRefs = await normalizeReferenceImagesForGeneration(refs)
        return await resolveImageSourceFromGeneration(job, {
          options: {
            referenceImages: normalizedRefs,
          },
        })
      }
    `

    expect(
      inspectImageReferenceNormalization('src/lib/workers/handlers/panel-image-task-handler.ts', content),
    ).toEqual([])
  })

  it('flags handlers that send referenceImages without normalization markers', () => {
    const content = `
      async function run() {
        return await resolveImageSourceFromGeneration(job, {
          options: {
            referenceImages: refs,
          },
        })
      }
    `

    expect(
      inspectImageReferenceNormalization('src/lib/workers/handlers/bad-handler.ts', content),
    ).toEqual([
      'src/lib/workers/handlers/bad-handler.ts uses resolveImageSourceFromGeneration with referenceImages but does not reference normalizeReferenceImagesForGeneration/normalizeToBase64ForGeneration/generateProjectLabeledImageToStorage/generateCleanImageToStorage',
    ])
  })
})
