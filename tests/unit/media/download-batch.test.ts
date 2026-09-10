import { describe, expect, it, vi } from 'vitest'
import { downloadCompleteBatch } from '@/lib/media/download-batch'

describe('complete media downloads', () => {
  const entries = [{ fileName: 'one.mp4', videoUrl: '/one' }, { fileName: 'two.mp4', videoUrl: '/two' }]
  it('retries failed transfers without downloading successful files again', async () => {
    let failures = 0
    const download = vi.fn(async (url: string) => {
      if (url === '/two' && failures++ === 0) throw new Error('temporary')
      return url
    })
    expect(await downloadCompleteBatch(entries, download)).toEqual([
      { fileName: 'one.mp4', data: '/one' }, { fileName: 'two.mp4', data: '/two' },
    ])
    expect(download.mock.calls.filter(([url]) => url === '/one')).toHaveLength(1)
  })
  it('rejects incomplete and empty archives with the exact missing file names', async () => {
    await expect(downloadCompleteBatch(entries, async () => { throw new Error('offline') }))
      .rejects.toThrow('0/2; one.mp4, two.mp4')
  })
})
