import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { SESSION_COOKIE_NAME } from '../../shared/constants.js'
import type {
  CookieSecurityConfig,
  SessionClientMetadata,
} from '../contracts/services.contract.js'

export function resolveCookieSecureFlag(
  c: Context,
  config: CookieSecurityConfig,
): boolean {
  if (config.cookieSecure === 'true') return true
  if (config.cookieSecure === 'false') return false

  const forwardedProto = c.req.header('x-forwarded-proto')
  if (forwardedProto) {
    return forwardedProto.split(',')[0]?.trim().toLowerCase() === 'https'
  }

  try {
    return new URL(c.req.url).protocol === 'https:'
  } catch {
    return false
  }
}

export function readRawSessionCookie(c: Context): string | undefined {
  return getCookie(c, SESSION_COOKIE_NAME)
}

export function writeSessionCookie(
  c: Context,
  rawToken: string,
  expiresAt: Date,
  config: CookieSecurityConfig,
): void {
  setCookie(c, SESSION_COOKIE_NAME, rawToken, {
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
    secure: resolveCookieSecureFlag(c, config),
    expires: expiresAt,
  })
}

export function clearSessionCookie(c: Context, config: CookieSecurityConfig): void {
  deleteCookie(c, SESSION_COOKIE_NAME, {
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
    secure: resolveCookieSecureFlag(c, config),
  })
}

export function extractSessionClientMetadata(c: Context): SessionClientMetadata {
  const forwardedFor = c.req.header('x-forwarded-for')
  const ipAddress = forwardedFor
    ? (forwardedFor.split(',')[0]?.trim() ?? null)
    : (c.req.header('x-real-ip')?.trim() ?? null)

  const userAgent = c.req.header('user-agent')?.trim() ?? null

  return {
    ipAddress,
    userAgent,
  }
}
