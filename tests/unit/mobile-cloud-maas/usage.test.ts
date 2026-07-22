import { describe, expect, it } from 'vitest'
import {
  buildPackageSummary,
  buildUsageTrend,
  deduplicateUsageRows,
  paginateUsageRows,
  splitDateRange,
} from '@/lib/mobile-cloud-maas/usage'
import type { MobileCloudUsageRow } from '@/lib/mobile-cloud-maas/types'

const rows: MobileCloudUsageRow[] = [
  {
    promptTokens: 0,
    completionTokens: 216900,
    totalTokens: 216900,
    useTime: '2026-07-14 15:00:00',
    inferenceId: 'inf-1',
    inferenceName: 'AICC-doubao-seedance-2.0',
    domainType: 'VISION',
    promptUsageAmount: 0,
    completionUsageAmount: 356345.01,
    totalUsageAmount: 356345.01,
  },
  {
    promptTokens: 0,
    completionTokens: 456300,
    totalTokens: 456300,
    useTime: '2026-07-14 00:00:00',
    inferenceId: 'inf-1',
    inferenceName: 'AICC-doubao-seedance-2.0',
    domainType: 'VISION',
    promptUsageAmount: 0,
    completionUsageAmount: 749655.27,
    totalUsageAmount: 749655.27,
  },
]

describe('mobile cloud MaaS usage helpers', () => {
  it('splits an inclusive range into chunks of at most 30 calendar days', () => {
    expect(splitDateRange('2026-05-01', '2026-07-01')).toEqual([
      { beginDate: '2026-05-01', endDate: '2026-05-30' },
      { beginDate: '2026-05-31', endDate: '2026-06-29' },
      { beginDate: '2026-06-30', endDate: '2026-07-01' },
    ])
  })

  it('rejects invalid or reversed dates', () => {
    expect(() => splitDateRange('2026-07-20', '2026-07-01')).toThrow('MOBILE_CLOUD_DATE_RANGE_INVALID')
    expect(() => splitDateRange('2026-02-30', '2026-03-01')).toThrow('MOBILE_CLOUD_DATE_INVALID')
  })

  it('calculates package totals from configured tokens per unit', () => {
    expect(buildPackageSummary({
      instanceId: 'MAAS-1',
      poolId: 'CIDC-RP-48',
      poolName: '华北-呼和浩特',
      chaGroupName: 'Seedance-700万tokens',
      resourceStatus: 'ONCE_USING',
      productOrderNum: 12,
      effectTime: '2026-07-06 19:11:02',
      expireTime: '2026-10-04 19:11:02',
      totalResourcePoint: null,
      remainingResourcePoint: 82482699.72,
    }, 7_000_000)).toMatchObject({
      totalTokens: 84_000_000,
      usedTokens: 1_517_300.28,
      remainingTokens: 82_482_699.72,
    })
  })

  it('prefers upstream total resource points and leaves unknown totals null', () => {
    const base = {
      instanceId: 'MAAS-1', poolId: 'pool', poolName: 'pool', chaGroupName: 'package',
      resourceStatus: 'ONCE_USING', productOrderNum: 2, effectTime: '2026-07-01 00:00:00',
      expireTime: '2026-10-01 00:00:00', remainingResourcePoint: 60,
    }
    expect(buildPackageSummary({ ...base, totalResourcePoint: 100 }, null).usedTokens).toBe(40)
    expect(buildPackageSummary({ ...base, totalResourcePoint: null }, null).totalTokens).toBeNull()
  })

  it('deduplicates rows and sorts newest first', () => {
    expect(deduplicateUsageRows([rows[1], rows[0], { ...rows[0] }])).toEqual(rows)
  })

  it('aggregates trend points by day', () => {
    expect(buildUsageTrend(rows)).toEqual([
      { date: '2026-07-14', totalTokens: 673200, totalUsageAmount: 1106000.28 },
    ])
  })

  it('paginates normalized rows locally', () => {
    expect(paginateUsageRows(rows, 2, 1)).toEqual({
      rows: [rows[1]],
      pagination: { page: 2, pageSize: 1, total: 2, totalPages: 2 },
    })
  })
})
