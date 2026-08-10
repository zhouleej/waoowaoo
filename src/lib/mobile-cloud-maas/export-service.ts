import { mapWithConcurrency } from '@/lib/async/map-with-concurrency'
import type { MobileCloudExportTask, MobileCloudExportTaskBatch } from './asset-types'

const DAY_MS = 24 * 60 * 60 * 1000
const MAX_EXPORT_WINDOW_MS = DAY_MS - 1000

export interface MobileCloudExportTaskClient {
  createDeductionExportTask(input: {
    apiKey?: string
    ramName?: string
    beginTime: string
    endTime: string
  }): Promise<{ taskId: string }>
  getDeductionExportTask(taskId: string): Promise<MobileCloudExportTask>
}

function parseDateOnly(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) throw new Error('MOBILE_CLOUD_DATE_INVALID')
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  if (date.toISOString().slice(0, 10) !== value) throw new Error('MOBILE_CLOUD_DATE_INVALID')
  return date
}

function dateTime(value: Date): string {
  return `${value.toISOString().slice(0, 10)} ${value.toISOString().slice(11, 19)}`
}

export function buildMobileCloudExportWindows(beginDate: string, endDate: string): Array<{ beginTime: string; endTime: string }> {
  const begin = parseDateOnly(beginDate)
  const endExclusive = new Date(parseDateOnly(endDate).getTime() + DAY_MS)
  if (begin.getTime() >= endExclusive.getTime()) throw new Error('MOBILE_CLOUD_DATE_RANGE_INVALID')

  const windows: Array<{ beginTime: string; endTime: string }> = []
  let cursor = begin
  while (cursor.getTime() < endExclusive.getTime()) {
    const next = new Date(Math.min(cursor.getTime() + MAX_EXPORT_WINDOW_MS, endExclusive.getTime()))
    windows.push({ beginTime: dateTime(cursor), endTime: dateTime(next) })
    cursor = next
  }
  return windows
}

export async function createMobileCloudExportTaskBatch(
  client: MobileCloudExportTaskClient,
  input: { beginDate: string; endDate: string; apiKey?: string; ramName?: string },
): Promise<string[]> {
  const windows = buildMobileCloudExportWindows(input.beginDate, input.endDate)
  const tasks = await mapWithConcurrency(windows, 4, (window) => client.createDeductionExportTask({
    ...window,
    ...(input.apiKey ? { apiKey: input.apiKey } : {}),
    ...(input.ramName ? { ramName: input.ramName } : {}),
  }))
  return tasks.map((task) => task.taskId)
}

export async function getMobileCloudExportTaskBatchStatus(
  client: MobileCloudExportTaskClient,
  taskIds: string[],
): Promise<MobileCloudExportTaskBatch> {
  const normalizedIds = [...new Set(taskIds.map((taskId) => taskId.trim()).filter(Boolean))]
  if (normalizedIds.length === 0) throw new Error('MOBILE_CLOUD_EXPORT_TASK_IDS_REQUIRED')
  const tasks = await mapWithConcurrency(normalizedIds, 8, (taskId) => client.getDeductionExportTask(taskId))
  const failed = tasks.find((task) => task.status === 'FAILED')
  const allSuccess = tasks.every((task) => task.status === 'SUCCESS')
  const status: MobileCloudExportTask['status'] = failed
    ? 'FAILED'
    : allSuccess
      ? 'SUCCESS'
      : tasks.some((task) => task.status === 'RUNNING')
        ? 'RUNNING'
        : 'PENDING'
  return {
    taskIds: normalizedIds,
    status,
    totalRows: tasks.reduce((total, task) => total + (task.totalRows ?? 0), 0),
    downloadUrls: tasks.flatMap((task) => task.downloadUrl ? [task.downloadUrl] : []),
    ...(failed?.errorMessage ? { errorMessage: failed.errorMessage } : {}),
  }
}
