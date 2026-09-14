const DEFAULT_VIDEO_WORKER_CONCURRENCY = 2
const MAX_VIDEO_WORKER_CONCURRENCY = 4

/**
 * Video completion performs network transfer, storage writes and sometimes
 * ffmpeg work. Keep the process-wide concurrency bounded even when an older
 * production .env still contains the former high-throughput example value.
 */
export function resolveVideoWorkerConcurrency(rawValue = process.env.QUEUE_CONCURRENCY_VIDEO): number {
  const parsed = Number.parseInt(rawValue || '', 10)
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return DEFAULT_VIDEO_WORKER_CONCURRENCY
  return Math.min(parsed, MAX_VIDEO_WORKER_CONCURRENCY)
}
