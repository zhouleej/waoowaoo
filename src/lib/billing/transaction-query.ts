export interface TransactionQueryBounds {
  page: number
  pageSize: number
}

export function parseTransactionQueryBounds(pageValue: string | null, pageSizeValue: string | null): TransactionQueryBounds {
  const parsedPage = Number.parseInt(pageValue || '1', 10)
  const parsedPageSize = Number.parseInt(pageSizeValue || '20', 10)
  return {
    page: Number.isFinite(parsedPage) ? Math.max(parsedPage, 1) : 1,
    pageSize: Number.isFinite(parsedPageSize) ? Math.min(Math.max(parsedPageSize, 1), 100) : 20,
  }
}

export function parseTransactionDate(value: string | null, endOfDay = false): Date | null | undefined {
  if (!value) return undefined
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  if (endOfDay) date.setHours(23, 59, 59, 999)
  return date
}
