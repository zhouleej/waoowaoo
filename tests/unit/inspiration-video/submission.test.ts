import { describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/prisma', () => ({ prisma: {
  inspirationVideoCreation: { findUnique: async () => ({ id: 'creation', taskId: null }) },
  task: { findFirst: async () => ({ id: 'accepted-task', status: 'queued' }) },
} }))
import { findAcceptedSubmission, submissionCreationId } from '@/lib/inspiration-video/submission'
describe('inspiration submission idempotency', () => {
  it('reuses an identity only within the same user and workspace', () => {
    const key = 'request_1234567890123456'
    expect(submissionCreationId('a', 'workspace', key)).toBe(submissionCreationId('a', 'workspace', key))
    expect(submissionCreationId('a', 'workspace', key)).not.toBe(submissionCreationId('b', 'workspace', key))
    expect(submissionCreationId('a', 'workspace', key)).not.toBe(submissionCreationId('a', 'other', key))
  })
  it('recovers the accepted task even when linking it to the creation failed', async () => {
    expect(await findAcceptedSubmission('creation')).toEqual({ success: true, async: true, creationId: 'creation', taskId: 'accepted-task', status: 'queued', deduped: true })
  })
})
