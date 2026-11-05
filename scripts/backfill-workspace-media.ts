import { prisma } from '../src/lib/prisma'
import { extractStorageKey } from '../src/lib/storage'

// Run after the additive schema migration, before enabling shared team access.
// Idempotent: existing grants and unrelated system media are retained.
const apply = process.argv.includes('--apply')
const grants = new Set<string>()

async function visit(value: unknown, scopeKey: string, field = ''): Promise<void> {
  if (Array.isArray(value)) { for (const child of value) await visit(child, scopeKey, field); return }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) await visit(child, scopeKey, key)
    return
  }
  if (typeof value !== 'string' || !value) return
  if (value.startsWith('{') || value.startsWith('[')) {
    try { await visit(JSON.parse(value), scopeKey, field) } catch { /* Plain content may start with a bracket. */ }
  }
  if (!/mediaId$|url$|urls$|key$|image|audio|video/i.test(field)) return
  const publicId = value.match(/\/m\/([^/?]+)/)?.[1]
  const storageKey = extractStorageKey(value)
  const media = /mediaId$/i.test(field)
    ? await prisma.mediaObject.findUnique({ where: { id: value }, select: { id: true } })
    : publicId ? await prisma.mediaObject.findUnique({ where: { publicId }, select: { id: true } })
      : storageKey ? await prisma.mediaObject.findUnique({ where: { storageKey }, select: { id: true } }) : null
  if (!media || grants.has(`${media.id}:${scopeKey}`)) return
  grants.add(`${media.id}:${scopeKey}`)
  if (apply) await prisma.mediaScopeGrant.upsert({ where: { mediaId_scopeKey: { mediaId: media.id, scopeKey } }, create: { mediaId: media.id, scopeKey }, update: {} })
}

async function main() {
  let cursor: string | undefined
  do {
    const projects = await prisma.project.findMany({ take: 25, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), orderBy: { id: 'asc' }, include: {
      novelPromotionData: { include: { characters: { include: { appearances: true } }, locations: { include: { images: true } }, episodes: { include: { clips: true, shots: true, storyboards: { include: { panels: true } }, voiceLines: true, editorProject: true } } } },
      inspirationVideoWorkspace: { include: { creations: { include: { assets: true } } } },
    } })
    for (const project of projects) await visit(project, project.organizationId ? `team:${project.organizationId}` : `personal:${project.userId}`)
    cursor = projects.length === 25 ? projects.at(-1)!.id : undefined
  } while (cursor)
  for (const kind of ['globalCharacter', 'globalLocation', 'globalVoice'] as const) {
    cursor = undefined
    do {
      const args = { take: 100, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), orderBy: { id: 'asc' as const } }
      const assets = kind === 'globalCharacter' ? await prisma.globalCharacter.findMany({ ...args, include: { appearances: true } })
        : kind === 'globalLocation' ? await prisma.globalLocation.findMany({ ...args, include: { images: true } }) : await prisma.globalVoice.findMany(args)
      for (const asset of assets) await visit(asset, asset.organizationId ? `team:${asset.organizationId}` : `personal:${asset.userId}`)
      cursor = assets.length === 100 ? assets.at(-1)!.id : undefined
    } while (cursor)
  }
  process.stdout.write(`${apply ? 'Applied' : 'Dry run:'} ${grants.size} workspace media grants.\n`)
}

main().catch(error => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1 }).finally(() => prisma.$disconnect())
