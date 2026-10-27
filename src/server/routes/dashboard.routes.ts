import { Hono } from 'hono'
import { dashboardQuerySchema } from '../../shared/schemas/index.js'
import type { AppServices, HonoAppEnv } from '../contracts/services.contract.js'
import {
  createRequireAuthMiddleware,
  requirePermission,
} from '../middlewares/auth.middleware.js'
import { validateQuery } from '../middlewares/validator.middleware.js'

export function createDashboardRoutes(services: AppServices) {
  const requireAuth = createRequireAuthMiddleware(services)
  const canViewDashboard = requirePermission('dashboard:view')

  return new Hono<HonoAppEnv>()
    .use('*', requireAuth, canViewDashboard)
    .get('/', validateQuery(dashboardQuerySchema), (c) => {
      const actor = c.get('currentUser')
      const query = c.req.valid('query')
      const metrics = services.reports.getDashboardMetrics(actor, query)
      return c.json({ ok: true as const, data: metrics }, 200)
    })
}
