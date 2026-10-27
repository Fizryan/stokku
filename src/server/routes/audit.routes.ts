import { Hono } from 'hono'
import { auditLogsQuerySchema } from '../../shared/schemas/index.js'
import type { AppServices, HonoAppEnv } from '../contracts/services.contract.js'
import {
  createRequireAuthMiddleware,
  requirePermission,
} from '../middlewares/auth.middleware.js'
import { validateQuery } from '../middlewares/validator.middleware.js'

export function createAuditRoutes(services: AppServices) {
  const requireAuth = createRequireAuthMiddleware(services)
  const canViewAudit = requirePermission('audit:view')

  return new Hono<HonoAppEnv>()
    .use('*', requireAuth, canViewAudit)
    .get('/', validateQuery(auditLogsQuerySchema), (c) => {
      const query = c.req.valid('query')
      const result = services.audit.listAuditLogs(query)
      return c.json({ ok: true as const, data: result }, 200)
    })
}
