export type DownloadEntry = { fileName: string; videoUrl: string }

/** Retry only failed transfers. Never present an incomplete archive as success. */
export async function downloadCompleteBatch<T>(
  entries: DownloadEntry[],
  download: (url: string) => Promise<T>,
  onProgress?: (completed: number, total: number) => void,
) {
  const completed = new Map<string, T>()
  let pending = [...entries]
  for (let attempt = 0; attempt < 3 && pending.length; attempt++) {
    const failed: DownloadEntry[] = []
    for (const entry of pending) {
      try {
        const data = await download(entry.videoUrl)
        completed.set(entry.fileName, data)
        onProgress?.(completed.size, entries.length)
      } catch { failed.push(entry) }
    }
    pending = failed
  }
  if (pending.length) {
    throw new Error(`${completed.size}/${entries.length}; ${pending.map((entry) => entry.fileName).join(', ')}`)
  }
  return entries.map((entry) => ({ fileName: entry.fileName, data: completed.get(entry.fileName)! }))
}
