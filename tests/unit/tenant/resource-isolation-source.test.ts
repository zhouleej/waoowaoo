import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

function readProjectFile(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')
}

describe('tenant resource isolation source guards', () => {
  it('does not pass project PATCH request bodies directly into Prisma updates', () => {
    const source = readProjectFile('src/app/api/projects/[projectId]/route.ts')

    expect(source).toContain('PROJECT_PATCH_BLOCKED_FIELDS')
    expect(source).toContain('pickProjectPatchData')
    expect(source).not.toMatch(/data:\s*body\b/)
    expect(source).toContain('organizationId')
    expect(source).toContain('userId')
  })
})
