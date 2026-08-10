import { mapWithConcurrency } from '@/lib/async/map-with-concurrency'
import type { MobileCloudExportTask, MobileCloudExportTaskBatch, MobileCloudExportWindow } from './asset-types'

const DAY_MS = 24 * 60 * 60 * 1000
const MAX_EXPORT_WINDOW_MS = DAY_MS - 1000
const MAX_UNFINISHED_EXPORT_TASKS = 3

export interface MobileCloudExportTaskClient {
  createDeductionExportTask(input: {
    apiKey?: string
    ramName?: string
    beginTime: string
    endTime: string
  }): Promise<{ taskId: string }>
  getDeductionExportTask(taskId: string): Promise<MobileCloudExportTask>
}

export interface MobileCloudExportTaskFilters {
  apiKey?: string
  ramName?: string
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
  input: { beginDate: string; endDate: string } & MobileCloudExportTaskFilters,
): Promise<{ taskIds: string[]; pendingWindows: MobileCloudExportWindow[] }> {
  const windows = buildMobileCloudExportWindows(input.beginDate, input.endDate)
  return createNextMobileCloudExportTasks(client, windows, input)
}

async function createNextMobileCloudExportTasks(
  client: MobileCloudExportTaskClient,
  windows: MobileCloudExportWindow[],
  filters: MobileCloudExportTaskFilters,
): Promise<{ taskIds: string[]; pendingWindows: MobileCloudExportWindow[] }> {
  const activeWindows = windows.slice(0, MAX_UNFINISHED_EXPORT_TASKS)
  const tasks = await mapWithConcurrency(activeWindows, MAX_UNFINISHED_EXPORT_TASKS, (window) => client.createDeductionExportTask({
    ...window,
    ...(filters.apiKey ? { apiKey: filters.apiKey } : {}),
    ...(filters.ramName ? { ramName: filters.ramName } : {}),
  }))
  return { taskIds: tasks.map((task) => task.taskId), pendingWindows: windows.slice(MAX_UNFINISHED_EXPORT_TASKS) }
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
    pendingWindows: [],
    ...(failed?.errorMessage ? { errorMessage: failed.errorMessage } : {}),
  }
}

export async function advanceMobileCloudExportTaskBatch(
  client: MobileCloudExportTaskClient,
  input: { taskIds: string[]; pendingWindows: MobileCloudExportWindow[] } & MobileCloudExportTaskFilters,
): Promise<MobileCloudExportTaskBatch> {
  const current = await getMobileCloudExportTaskBatchStatus(client, input.taskIds)
  if (current.status !== 'SUCCESS' || input.pendingWindows.length === 0) {
    return { ...current, pendingWindows: input.pendingWindows }
  }
  const next = await createNextMobileCloudExportTasks(client, input.pendingWindows, input)
  const nextStatus = await getMobileCloudExportTaskBatchStatus(client, [...current.taskIds, ...next.taskIds])
  return { ...nextStatus, pendingWindows: next.pendingWindows }
}
