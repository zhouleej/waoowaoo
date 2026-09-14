import { describe, expect, it } from 'vitest'
import {
  applyInspirationVideoProgress,
  shouldRefreshInspirationVideoWorkspace,
} from '@/lib/inspiration-video/live-state'
import { TASK_EVENT_TYPE, TASK_SSE_EVENT_TYPE, type SSEEvent } from '@/lib/task/types'

function event(lifecycleType: string, progress?: number): SSEEvent {
  return {
    id: 'event-1',
    type: TASK_SSE_EVENT_TYPE.LIFECYCLE,
    taskId: 'task-1',
    projectId: 'project-1',
    userId: 'user-1',
    targetType: 'InspirationVideoCreation',
    targetId: 'creation-1',
    ts: new Date(0).toISOString(),
    payload: {
      lifecycleType: lifecycleType as typeof TASK_EVENT_TYPE.PROCESSING,
      ...(progress === undefined ? {} : { progress }),
    },
  }
}

describe('inspiration video live state', () => {
  it('updates progress locally without requesting a full workspace refresh', () => {
    const progressEvent = event(TASK_EVENT_TYPE.PROCESSING, 67)
    const creations = [{ id: 'creation-1', taskId: null, status: 'queued', progress: 0 }]

    expect(applyInspirationVideoProgress(creations, progressEvent)).toEqual([{
      id: 'creation-1',
      taskId: 'task-1',
      status: 'processing',
      progress: 67,
    }])
    expect(shouldRefreshInspirationVideoWorkspace(progressEvent)).toBe(false)
  })

  it('refreshes persisted data only for creation and terminal events', () => {
    expect(shouldRefreshInspirationVideoWorkspace(event(TASK_EVENT_TYPE.CREATED))).toBe(true)
    expect(shouldRefreshInspirationVideoWorkspace(event(TASK_EVENT_TYPE.COMPLETED))).toBe(true)
    expect(shouldRefreshInspirationVideoWorkspace(event(TASK_EVENT_TYPE.FAILED))).toBe(true)
  })
})
