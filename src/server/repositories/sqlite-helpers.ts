import type { PaginationMeta } from '../../shared/types.js'
import { AppError } from '../errors/app-error.js'

export function buildPaginationMeta(
  page: number,
  pageSize: number,
  totalItems: number,
): PaginationMeta {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  return {
    page,
    pageSize,
    totalItems,
    totalPages,
  }
}

export function isSqliteUniqueConstraintError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return error.message.includes('UNIQUE constraint failed')
}

export function isSqliteForeignKeyConstraintError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return error.message.includes('FOREIGN KEY constraint failed')
}

export function rethrowUniqueAsConflict(
  error: unknown,
  fallbackMessage: string,
  columnMessages?: Readonly<Record<string, string>>,
): never {
  if (isSqliteUniqueConstraintError(error) && error instanceof Error) {
    if (columnMessages) {
      for (const [col, customMsg] of Object.entries(columnMessages)) {
        if (error.message.includes(col)) {
          throw AppError.conflict(customMsg)
        }
      }
    }
    throw AppError.conflict(fallbackMessage)
  }
  throw error
}

export function dateFilterToUtcStartIso(dateYmd: string): string {
  const [year, month, day] = dateYmd.split('-').map((n) => Number.parseInt(n, 10))
  const localStart = new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1, 0, 0, 0, 0)
  return localStart.toISOString()
}

export function dateFilterToUtcEndIso(dateYmd: string): string {
  const [year, month, day] = dateYmd.split('-').map((n) => Number.parseInt(n, 10))
  const localEnd = new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1, 23, 59, 59, 999)
  return localEnd.toISOString()
}

export function escapeSqlLikePattern(input: string): string {
  return input.replace(/[\\%_]/g, (match) => `\\${match}`)
}
