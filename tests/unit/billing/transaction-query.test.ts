import { describe, expect, it } from 'vitest'
import { parseTransactionDate, parseTransactionQueryBounds } from '@/lib/billing/transaction-query'

describe('transaction query boundaries', () => {
  it('clamps page and pageSize to safe query bounds', () => {
    expect(parseTransactionQueryBounds('-5', '1000')).toEqual({ page: 1, pageSize: 100 })
    expect(parseTransactionQueryBounds('3', '0')).toEqual({ page: 3, pageSize: 1 })
  })

  it('uses defaults for non-numeric query values', () => {
    expect(parseTransactionQueryBounds('invalid', 'invalid')).toEqual({ page: 1, pageSize: 20 })
  })

  it('distinguishes absent and invalid dates', () => {
    expect(parseTransactionDate(null)).toBeUndefined()
    expect(parseTransactionDate('not-a-date')).toBeNull()
  })

  it('expands a valid end date through the end of the local day', () => {
    const date = parseTransactionDate('2026-07-17', true)
    expect(date).toBeInstanceOf(Date)
    expect(date && [date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds()]).toEqual([23, 59, 59, 999])
  })
})
