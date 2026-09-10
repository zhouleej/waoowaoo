import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import path from 'node:path'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

const include = {
  clips: true, shots: true, voiceLines: true, editorProject: true,
  storyboards: { include: { panels: true, supplementaryPanels: true } },
} as const
type EpisodeSnapshot = Prisma.NovelPromotionEpisodeGetPayload<{ include: typeof include }>
type SnapshotFile = { version: 1; id: string; projectId: string; episodeId: string; createdAt: string; episode: EpisodeSnapshot }

function directory(episodeId: string) {
  return path.join(process.cwd(), 'data', 'episode-snapshots', createHash('sha256').update(episodeId).digest('hex'))
}

export async function saveEpisodeSnapshot(tx: Prisma.TransactionClient, episodeId: string) {
  const episode = await tx.novelPromotionEpisode.findUnique({ where: { id: episodeId }, include })
  if (!episode || (!episode.clips.length && !episode.storyboards.length && !episode.voiceLines.length)) return null
  const project = await tx.novelPromotionProject.findUnique({ where: { id: episode.novelPromotionProjectId }, select: { projectId: true } })
  if (!project) throw new Error('SNAPSHOT_PROJECT_NOT_FOUND')
  const snapshot: SnapshotFile = { version: 1, id: randomUUID(), projectId: project.projectId, episodeId, createdAt: new Date().toISOString(), episode }
  await mkdir(directory(episodeId), { recursive: true })
  await writeFile(path.join(directory(episodeId), `${snapshot.id}.json`), JSON.stringify(snapshot), { encoding: 'utf8', flag: 'wx' })
  return snapshot.id
}

async function readSnapshot(projectId: string, episodeId: string, id: string): Promise<SnapshotFile> {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('INVALID_SNAPSHOT_ID')
  const snapshot = JSON.parse(await readFile(path.join(directory(episodeId), `${id}.json`), 'utf8')) as SnapshotFile
  if (snapshot.version !== 1 || snapshot.projectId !== projectId || snapshot.episodeId !== episodeId || snapshot.episode.id !== episodeId) throw new Error('SNAPSHOT_SCOPE_MISMATCH')
  return snapshot
}

export async function listEpisodeSnapshots(projectId: string, episodeId: string) {
  const names = await readdir(directory(episodeId)).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return []
    throw error
  })
  const rows = await Promise.all(names.filter((name) => name.endsWith('.json')).map(async (name) => {
    const snapshot = await readSnapshot(projectId, episodeId, name.slice(0, -5))
    return { id: snapshot.id, createdAt: snapshot.createdAt, name: snapshot.episode.name,
      clips: snapshot.episode.clips.length, panels: snapshot.episode.storyboards.reduce((sum, row) => sum + row.panels.length, 0), voices: snapshot.episode.voiceLines.length }
  }))
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function restoreEpisodeSnapshot(projectId: string, episodeId: string, id: string) {
  const snapshot = await readSnapshot(projectId, episodeId, id)
  return prisma.$transaction(async (tx) => {
    const current = await tx.novelPromotionEpisode.findFirst({ where: { id: episodeId, novelPromotionProject: { projectId } } })
    if (!current || current.novelPromotionProjectId !== snapshot.episode.novelPromotionProjectId) throw new Error('SNAPSHOT_SCOPE_MISMATCH')
    const active = await tx.task.count({ where: { projectId, status: { in: ['queued', 'processing', 'settling'] } } })
    if (active) throw new Error('请先等待或取消当前项目中的生成任务，再恢复版本')
    await saveEpisodeSnapshot(tx, episodeId)
    const { clips, shots, storyboards, voiceLines, editorProject, ...episode } = snapshot.episode
    await tx.novelPromotionEpisode.delete({ where: { id: episodeId } })
    await tx.novelPromotionEpisode.create({ data: episode })
    for (const clip of clips) await tx.novelPromotionClip.create({ data: clip })
    for (const shot of shots) await tx.novelPromotionShot.create({ data: shot })
    for (const row of storyboards) {
      const { panels, supplementaryPanels, ...storyboard } = row
      await tx.novelPromotionStoryboard.create({ data: storyboard })
      for (const panel of panels) await tx.novelPromotionPanel.create({ data: panel })
      for (const panel of supplementaryPanels) await tx.supplementaryPanel.create({ data: panel })
    }
    for (const line of voiceLines) await tx.novelPromotionVoiceLine.create({ data: line })
    if (editorProject) await tx.videoEditorProject.create({ data: { ...editorProject, renderTaskId: null, renderStatus: null } })
    return { restored: id }
  }, { timeout: 30000 })
}
