import { describe, expect, it } from 'vitest'
import { collectBatchSubmissions } from '@/lib/task/batch-submit'
describe('batch task submission', () => {
  it('returns accepted tasks even when another target is rejected', async () => {
    const result = await collectBatchSubmissions([{ id: 'a' }, { id: 'b' }, { id: 'c' }], async (item) => {
      if (item.id === 'b') throw new Error('quota exceeded')
      return { taskId: `task-${item.id}` }
    })
    expect(result).toEqual({ total: 3, accepted: [{ taskId: 'task-a' }, { taskId: 'task-c' }], rejected: [{ id: 'b', message: 'quota exceeded' }] })
  })
})
