export async function resolveFfmpegExecutable(): Promise<string> {
  const configured = process.env.FFMPEG_PATH?.trim()
  if (configured) return configured

  const { RenderInternals } = await import('@remotion/renderer')
  return RenderInternals.getExecutablePath({
    type: 'ffmpeg',
    indent: false,
    logLevel: 'error',
    binariesDirectory: process.env.REMOTION_BINARIES_DIRECTORY?.trim() || null,
  })
}
