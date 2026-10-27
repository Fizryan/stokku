import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { ApiErrorDetail } from '../../shared/types.js'

export type ErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'VALIDATION_ERROR'
  | 'INSUFFICIENT_STOCK'
  | 'RATE_LIMITED'
  | 'SETUP_ALREADY_COMPLETED'
  | 'SETUP_REQUIRED'
  | 'BAD_REQUEST'
  | 'INTERNAL_ERROR'

export class AppError extends Error {
  public readonly code: ErrorCode
  public readonly statusCode: ContentfulStatusCode
  public readonly issues?: readonly ApiErrorDetail[]

  public constructor(
    code: ErrorCode,
    statusCode: ContentfulStatusCode,
    message: string,
    issues?: readonly ApiErrorDetail[],
  ) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.statusCode = statusCode
    this.issues = issues
  }

  public static badRequest(
    message: string,
    issues?: readonly ApiErrorDetail[],
  ): AppError {
    return new AppError('BAD_REQUEST', 400, message, issues)
  }

  public static unauthorized(
    message = 'Sesi tidak valid atau telah berakhir.',
  ): AppError {
    return new AppError('UNAUTHORIZED', 401, message)
  }

  public static forbidden(
    message = 'Anda tidak memiliki izin untuk aksi ini.',
  ): AppError {
    return new AppError('FORBIDDEN', 403, message)
  }

  public static notFound(message = 'Data yang diminta tidak ditemukan.'): AppError {
    return new AppError('NOT_FOUND', 404, message)
  }

  public static conflict(message: string): AppError {
    return new AppError('CONFLICT', 409, message)
  }

  public static insufficientStock(message: string): AppError {
    return new AppError('INSUFFICIENT_STOCK', 409, message)
  }

  public static validation(
    message: string,
    issues?: readonly ApiErrorDetail[],
  ): AppError {
    return new AppError('VALIDATION_ERROR', 422, message, issues)
  }

  public static rateLimited(message: string): AppError {
    return new AppError('RATE_LIMITED', 429, message)
  }
}
