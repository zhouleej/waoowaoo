import { describe, expect, it } from 'vitest'
import {
  ORGANIZATION_BUSINESS_STATUSES,
  ORGANIZATION_STATUSES,
  isSensitiveConfigKey,
  maskConfigValue,
  readPlatformPagination,
  readStrictBoolean,
  readStringEnum,
  safeParseAuditDetails,
} from '@/lib/platform/validation'

describe('platform management validation', () => {
  it('uses safe pagination defaults and computes the Prisma offset', () => {
    expect(readPlatformPagination(new URLSearchParams(), { limit: 20 })).toEqual({ page: 1, limit: 20, skip: 0 })
    expect(readPlatformPagination(new URLSearchParams({ page: '3', limit: '10' }), { limit: 20 }))
      .toEqual({ page: 3, limit: 10, skip: 20 })
  })

  it.each([
    new URLSearchParams({ page: '0' }),
    new URLSearchParams({ page: '-1' }),
    new URLSearchParams({ page: '1.5' }),
    new URLSearchParams({ limit: '0' }),
    new URLSearchParams({ limit: '101' }),
    new URLSearchParams({ limit: 'NaN' }),
  ])('rejects invalid pagination values', (params) => {
    expect(() => readPlatformPagination(params, { limit: 20 })).toThrow()
  })

  it('only accepts strict booleans for management mutations', () => {
    expect(readStrictBoolean(true, 'isPlatformAdmin')).toBe(true)
    expect(() => readStrictBoolean('false', 'isPlatformAdmin')).toThrow('must be a boolean')
    expect(() => readStrictBoolean(0, 'isPlatformAdmin')).toThrow('must be a boolean')
  })

  it('only accepts declared organization statuses', () => {
    expect(readStringEnum('active', 'status', ORGANIZATION_STATUSES)).toBe('active')
    expect(readStringEnum('overdue', 'businessStatus', ORGANIZATION_BUSINESS_STATUSES)).toBe('overdue')
    expect(() => readStringEnum('unexpected', 'status', ORGANIZATION_STATUSES)).toThrow('status is invalid')
  })

  it('keeps an audit feed available when one detail payload is malformed', () => {
    expect(safeParseAuditDetails('{"target":"org-1"}')).toEqual({ target: 'org-1' })
    expect(safeParseAuditDetails('{not-json')).toEqual({ raw: '{not-json', parseError: true })
    expect(safeParseAuditDetails(null)).toBeNull()
  })

  it('masks sensitive system configuration values by default', () => {
    expect(isSensitiveConfigKey('MOBILE_CLOUD_API_TOKEN')).toBe(true)
    expect(isSensitiveConfigKey('database_password')).toBe(true)
    expect(isSensitiveConfigKey('feature_enabled')).toBe(false)
    expect(maskConfigValue('sensitive-value')).toMatch(/^•+$/)
  })
})
