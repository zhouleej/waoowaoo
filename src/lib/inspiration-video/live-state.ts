import {
  TASK_EVENT_TYPE,
  TASK_SSE_EVENT_TYPE,
  type SSEEvent,
} from '@/lib/task/types'

type LiveCreation = {
  id: string
  taskId?: string | null
  status: string
  progress: number
}

function lifecycleType(event: SSEEvent) {
  return event.type === TASK_SSE_EVENT_TYPE.LIFECYCLE
    ? event.payload?.lifecycleType || null
    : null
}

export function applyInspirationVideoProgress<T extends LiveCreation>(
  creations: T[],
  event: SSEEvent,
): T[] {
  if (
    event.targetType !== 'InspirationVideoCreation'
    || lifecycleType(event) !== TASK_EVENT_TYPE.PROCESSING
    || !event.targetId
  ) {
    return creations
  }
  const progress = typeof event.payload?.progress === 'number'
    ? Math.max(0, Math.min(99, Math.floor(event.payload.progress)))
    : null
  let changed = false
  const next = creations.map((creation) => {
    if (creation.id !== event.targetId) return creation
    changed = true
    return {
      ...creation,
      taskId: event.taskId || creation.taskId,
      status: 'processing',
      progress: progress ?? creation.progress,
    }
  })
  return changed ? next : creations
}

export function shouldRefreshInspirationVideoWorkspace(event: SSEEvent): boolean {
  if (event.targetType !== 'InspirationVideoCreation') return false
  const type = lifecycleType(event)
  return type === TASK_EVENT_TYPE.CREATED
    || type === TASK_EVENT_TYPE.COMPLETED
    || type === TASK_EVENT_TYPE.FAILED
}
