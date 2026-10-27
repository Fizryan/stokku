import { createMiddleware } from 'hono/factory'
import { hasPermission, type Permission } from '../../shared/constants.js'
import type { AppServices, HonoAppEnv } from '../contracts/services.contract.js'
import { AppError } from '../errors/app-error.js'
import {
  clearSessionCookie,
  readRawSessionCookie,
  writeSessionCookie,
} from './session-cookie.js'

export function createRequireAuthMiddleware(services: AppServices) {
  return createMiddleware<HonoAppEnv>(async (c, next) => {
    const rawToken = readRawSessionCookie(c)
    if (!rawToken) {
      throw AppError.unauthorized('Silakan login terlebih dahulu.')
    }

    const validated = services.auth.validateSessionToken(rawToken)
    if (!validated) {
      clearSessionCookie(c, services.cookieConfig)
      throw AppError.unauthorized('Sesi Anda telah berakhir. Silakan login kembali.')
    }

    if (validated.refreshedExpiresAt) {
      writeSessionCookie(c, rawToken, validated.refreshedExpiresAt, services.cookieConfig)
    }

    c.set('currentUser', validated.user)
    c.set('sessionId', validated.sessionId)
    await next()
  })
}

export function requirePermission(permission: Permission) {
  return createMiddleware<HonoAppEnv>(async (c, next) => {
    const user = c.get('currentUser')
    if (!user) {
      throw AppError.unauthorized()
    }
    if (!hasPermission(user.role, permission)) {
      throw AppError.forbidden('Role akun Anda tidak memiliki akses ke fitur ini.')
    }
    await next()
  })
}
