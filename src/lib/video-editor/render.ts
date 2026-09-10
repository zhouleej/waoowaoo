import path from 'node:path'
import { mkdir } from 'node:fs/promises'
import { bundle } from '@remotion/bundler'
import { makeCancelSignal, renderMedia, selectComposition } from '@remotion/renderer'
import type { VideoEditorProject } from '@/features/video-editor/types/editor.types'

let bundlePromise: Promise<string> | undefined

export async function renderEditorVideo(project: VideoEditorProject, outputLocation: string, checkActive?: () => Promise<void>) {
  if (!bundlePromise) {
    bundlePromise = (async () => {
      const outDir = path.join(process.cwd(), 'data', 'editor-bundle')
      await mkdir(outDir, { recursive: true })
      return bundle({ entryPoint: path.join(process.cwd(), 'src/features/video-editor/remotion/Root.tsx'), outDir })
    })().catch((error) => { bundlePromise = undefined; throw error })
  }
  const serveUrl = await bundlePromise
  const inputProps = { clips: project.timeline, bgmTrack: project.bgmTrack, config: project.config }
  const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE || undefined
  const composition = await selectComposition({ serveUrl, id: 'Episode', inputProps, browserExecutable })
  const { cancel, cancelSignal } = makeCancelSignal()
  let checking = false
  const timer = checkActive ? setInterval(() => {
    if (checking) return
    checking = true
    void checkActive().catch(() => cancel()).finally(() => { checking = false })
  }, 3000) : undefined
  try {
    await renderMedia({ serveUrl, composition, inputProps, outputLocation, codec: 'h264', cancelSignal,
    browserExecutable, concurrency: 1, crf: 20, enforceAudioTrack: true,
    })
  } finally { clearInterval(timer) }
}
