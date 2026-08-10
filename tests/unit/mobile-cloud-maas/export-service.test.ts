import { describe, expect, it, vi } from 'vitest'
import { buildMobileCloudExportWindows, createMobileCloudExportTaskBatch, getMobileCloudExportTaskBatchStatus } from '@/lib/mobile-cloud-maas/export-service'

describe('Mobile Cloud export task service', () => {
  it('creates continuous upstream-safe windows strictly shorter than 24 hours', () => {
    const windows = buildMobileCloudExportWindows('2026-07-12', '2026-07-12')
    expect(windows).toEqual([
      { beginTime: '2026-07-12 00:00:00', endTime: '2026-07-12 23:59:59' },
      { beginTime: '2026-07-12 23:59:59', endTime: '2026-07-13 00:00:00' },
    ])
    expect(buildMobileCloudExportWindows('2026-07-12', '2026-08-10')).toHaveLength(31)
  })

  it('creates all export tasks with the documented filters', async () => {
    const create = vi.fn(async ({ beginTime }: { beginTime: string }) => ({ taskId: `task-${beginTime}` }))
    const batch = await createMobileCloudExportTaskBatch({ createDeductionExportTask: create, getDeductionExportTask: vi.fn() }, {
      beginDate: '2026-07-12', endDate: '2026-07-12', apiKey: 'key-name', ramName: 'ram-a',
    })
    expect(batch.taskIds).toHaveLength(2)
    expect(batch.pendingWindows).toEqual([])
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'key-name', ramName: 'ram-a' }))
  })

  it('aggregates status and download URLs across tasks', async () => {
    const get = vi.fn(async (taskId: string) => ({ taskId, status: 'SUCCESS' as const, totalRows: 2, downloadUrl: `https://download/${taskId}` }))
    await expect(getMobileCloudExportTaskBatchStatus({ createDeductionExportTask: vi.fn(), getDeductionExportTask: get }, ['task-1', 'task-2', 'task-1'])).resolves.toEqual({
      taskIds: ['task-1', 'task-2'], status: 'SUCCESS', totalRows: 4,
      downloadUrls: ['https://download/task-1', 'https://download/task-2'],
      pendingWindows: [],
    })
  })

  it('waits for the current three tasks before creating the next wave', async () => {
    const create = vi.fn()
      .mockResolvedValueOnce({ taskId: 'task-4' })
    const get = vi.fn(async (taskId: string) => ({ taskId, status: 'SUCCESS' as const, totalRows: 1, downloadUrl: `https://download/${taskId}` }))
    const data = await (await import('@/lib/mobile-cloud-maas/export-service')).advanceMobileCloudExportTaskBatch(
      { createDeductionExportTask: create, getDeductionExportTask: get },
      { taskIds: ['task-1', 'task-2', 'task-3'], pendingWindows: [{ beginTime: '2026-07-13 00:00:00', endTime: '2026-07-13 23:59:59' }] },
    )
    expect(create).toHaveBeenCalledTimes(1)
    expect(data.taskIds).toContain('task-4')
    expect(data.status).toBe('SUCCESS')
    expect(data.pendingWindows).toEqual([])
  })
})
