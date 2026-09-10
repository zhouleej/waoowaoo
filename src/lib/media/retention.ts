import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

/** Deletion candidates are retained, never deleted on the request path.
 * Published assets and legacy JSON references can share the same objects.
 * A later storage audit must prove they are unreferenced before collection.
 */
export async function retainProjectMedia(projectId: string, keys: string[]) {
  const directory = path.join(process.cwd(), 'data', 'media-retention')
  await mkdir(directory, { recursive: true })
  const manifestId = randomUUID()
  await writeFile(path.join(directory, `${manifestId}.json`), JSON.stringify({
    version: 1, projectId, createdAt: new Date().toISOString(),
    status: 'retained', keys: [...new Set(keys)],
  }), { encoding: 'utf8', flag: 'wx' })
  return manifestId
}
