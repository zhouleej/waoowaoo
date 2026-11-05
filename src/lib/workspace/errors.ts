import { getErrorSpec, type UnifiedErrorCode } from '@/lib/errors/codes'

// This low-level error deliberately has no dependency on API routes or Prisma.
export class WorkspaceError extends Error {
  readonly status: number
  constructor(readonly code: UnifiedErrorCode, readonly details?: Record<string, unknown>) {
    const spec = getErrorSpec(code)
    super(typeof details?.message === 'string' ? details.message : spec.defaultMessage)
    this.status = spec.httpStatus
  }
}
