import { describe, expect, it } from 'vitest'
import { resolveVideoWorkerConcurrency } from '@/lib/workers/video-concurrency'

describe('video worker concurrency', () => {
  it('uses a conservative default for missing or invalid configuration', () => {
    expect(resolveVideoWorkerConcurrency(undefined)).toBe(2)
    expect(resolveVideoWorkerConcurrency('0')).toBe(2)
    expect(resolveVideoWorkerConcurrency('invalid')).toBe(2)
  })

  it('honors small values and caps legacy high-throughput settings', () => {
    expect(resolveVideoWorkerConcurrency('1')).toBe(1)
    expect(resolveVideoWorkerConcurrency('3')).toBe(3)
    expect(resolveVideoWorkerConcurrency('50')).toBe(4)
  })
})
