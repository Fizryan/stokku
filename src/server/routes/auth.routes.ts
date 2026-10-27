import { Hono } from 'hono'
import {
  changePasswordSchema,
  initialSetupSchema,
  loginSchema,
} from '../../shared/schemas/index.js'
import type { AppServices, HonoAppEnv } from '../contracts/services.contract.js'
import { createRequireAuthMiddleware } from '../middlewares/auth.middleware.js'
import {
  clearSessionCookie,
  extractSessionClientMetadata,
  readRawSessionCookie,
  writeSessionCookie,
} from '../middlewares/session-cookie.js'
import { validateJson } from '../middlewares/validator.middleware.js'

export function createAuthRoutes(services: AppServices) {
  const requireAuth = createRequireAuthMiddleware(services)

  return new Hono<HonoAppEnv>()
    .get('/session', (c) => {
      const rawToken = readRawSessionCookie(c)
      const sessionStatus = services.auth.getSessionStatus(rawToken)
      if (!sessionStatus.user && rawToken) {
        clearSessionCookie(c, services.cookieConfig)
      }
      return c.json({ ok: true as const, data: sessionStatus }, 200)
    })
    .post('/setup', validateJson(initialSetupSchema), async (c) => {
      const input = c.req.valid('json')
      const meta = extractSessionClientMetadata(c)
      const result = await services.auth.initializeFirstOwner(input, meta)
      writeSessionCookie(
        c,
        result.rawSessionToken,
        result.expiresAt,
        services.cookieConfig,
      )
      return c.json({ ok: true as const, data: { user: result.user } }, 201)
    })
    .post('/login', validateJson(loginSchema), async (c) => {
      const input = c.req.valid('json')
      const meta = extractSessionClientMetadata(c)
      const result = await services.auth.login(input, meta)
      writeSessionCookie(
        c,
        result.rawSessionToken,
        result.expiresAt,
        services.cookieConfig,
      )
      return c.json({ ok: true as const, data: { user: result.user } }, 200)
    })
    .post('/logout', (c) => {
      const rawToken = readRawSessionCookie(c)
      services.auth.logout(rawToken)
      clearSessionCookie(c, services.cookieConfig)
      return c.json({ ok: true as const, data: { loggedOut: true } }, 200)
    })
    .post(
      '/change-password',
      requireAuth,
      validateJson(changePasswordSchema),
      async (c) => {
        const actor = c.get('currentUser')
        const sessionId = c.get('sessionId')
        const input = c.req.valid('json')
        await services.auth.changeOwnPassword(actor, sessionId, input)
        return c.json({ ok: true as const, data: { updated: true } }, 200)
      },
    )
}
