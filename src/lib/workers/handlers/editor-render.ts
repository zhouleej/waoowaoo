import type { Job } from 'bullmq'
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import path from 'node:path'
import { prisma } from '@/lib/prisma'
import { getObjectBuffer, uploadObject } from '@/lib/storage'
import { editorProjectSchema } from '@/features/video-editor/utils/project-schema'
import { renderEditorVideo } from '@/lib/video-editor/render'
import { authorizeEditorMedia } from '@/lib/video-editor/media-access'
import { assertTaskActive } from '../utils'
import { reportTaskProgress } from '../shared'
import type { TaskJobData } from '@/lib/task/types'

export async function handleEditorRenderTask(job: Job<TaskJobData>) {
  const project = editorProjectSchema.parse(job.data.payload?.projectData)
  const authorized = await authorizeEditorMedia(job.data.projectId, project)
  const root = path.resolve(process.cwd(), 'data', 'editor-renders')
  const directory = path.join(root, randomUUID())
  await mkdir(directory, { recursive: true })
  const files = new Map<string, { file: string; size: number }>()
  const urls = new Map<string, string>()
  const token = randomUUID()
  const server = createServer((req, res) => {
    const asset = files.get(req.url || '')
    if (!asset) { res.writeHead(404).end(); return }
    const match = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || '')
    const start = match ? Number(match[1]) : 0
    const end = match && match[2] ? Math.min(Number(match[2]), asset.size - 1) : asset.size - 1
    if (start > end || start >= asset.size) { res.writeHead(416).end(); return }
    res.writeHead(match ? 206 : 200, { 'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes',
      ...(match ? { 'Content-Range': `bytes ${start}-${end}/${asset.size}` } : {}),
    })
    createReadStream(asset.file, { start, end }).pipe(res)
  })
  try {
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('EDITOR_MEDIA_SERVER_FAILED')
    for (const [index, key] of authorized.keys.entries()) {
      await assertTaskActive(job, 'editor_prepare')
      const data = await getObjectBuffer(key)
      const file = path.join(directory, `${index}${path.extname(key)}`)
      await writeFile(file, data)
      const route = `/${token}/${index}${path.extname(key)}`
      files.set(route, { file, size: data.length })
      urls.set(key, `http://127.0.0.1:${address.port}${route}`)
    }
    const renderProject = authorized.project
    for (const clip of renderProject.timeline) {
      clip.src = urls.get(clip.src)!
      for (const attachment of [clip.attachment, ...(clip.dialogue || [])]) {
        if (attachment?.audio) attachment.audio.src = urls.get(attachment.audio.src)!
      }
    }
    for (const bgm of renderProject.bgmTrack) bgm.src = urls.get(bgm.src)!
    await reportTaskProgress(job, 25, { stage: 'editor_render', message: '正在合成视频' })
    const output = path.join(directory, 'output.mp4')
    await renderEditorVideo(renderProject, output, () => assertTaskActive(job, 'editor_render'))
    await assertTaskActive(job, 'editor_upload')
    const outputUrl = await uploadObject(await readFile(output), `editor/${job.data.projectId}/${randomUUID()}.mp4`, 3, 'video/mp4')
    await prisma.videoEditorProject.update({ where: { id: job.data.targetId }, data: { outputUrl, renderStatus: 'completed' } })
    return { outputUrl }
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    // directory was created with a random UUID directly beneath this fixed root.
    if (path.dirname(directory) === root) await rm(directory, { recursive: true, force: true })
  }
}
