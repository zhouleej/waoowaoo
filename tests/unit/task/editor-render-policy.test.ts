import { describe, expect, it } from 'vitest'
import { TASK_TYPE } from '@/lib/task/types'
import { resolveTaskIntent } from '@/lib/task/intent'
import { isBillableTaskType } from '@/lib/billing/task-policy'
describe('editor render task policy', () => {
  it('uses local processing without model API billing', () => {
    expect(resolveTaskIntent(TASK_TYPE.EDITOR_RENDER)).toBe('process')
    expect(isBillableTaskType(TASK_TYPE.EDITOR_RENDER)).toBe(false)
  })
})
