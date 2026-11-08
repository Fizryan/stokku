import type { ErrorHandler } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { ApiFailureResponse } from '../../shared/types.js'
import { AppError } from '../errors/app-error.js'

export const globalErrorHandler: ErrorHandler = (err, c) => {
  if (err instanceof AppError) {
    const body: ApiFailureResponse = {
      ok: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err.issues ? { issues: err.issues } : {}),
      },
    }
    return c.json(body, err.statusCode)
  }

  if (err instanceof HTTPException) {
    const status = err.status
    let message = err.message || 'Permintaan HTTP tidak dapat diproses.'
    if (status === 403) {
      message = 'Permintaan ditolak oleh kebijakan keamanan (CSRF / Origin).'
    } else if (status === 413) {
      message = 'Ukuran payload melebihi batas maksimum.'
    }

    const body: ApiFailureResponse = {
      ok: false,
      error: {
        code: status === 403 ? 'FORBIDDEN' : 'BAD_REQUEST',
        message,
      },
    }
    return c.json(body, status)
  }

  if (err instanceof SyntaxError) {
    const body: ApiFailureResponse = {
      ok: false,
      error: {
        code: 'BAD_REQUEST',
        message: 'Format JSON pada body request tidak valid.',
      },
    }
    return c.json(body, 400)
  }

  console.error('[Stokku Unhandled Error]', err)

  const body: ApiFailureResponse = {
    ok: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Terjadi kesalahan internal pada server.',
    },
  }
  return c.json(body, 500)
}
