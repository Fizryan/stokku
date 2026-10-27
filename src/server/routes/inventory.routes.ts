import { Hono } from 'hono'
import {
  movementQuerySchema,
  recordStockMovementSchema,
} from '../../shared/schemas/index.js'
import type { AppServices, HonoAppEnv } from '../contracts/services.contract.js'
import {
  createRequireAuthMiddleware,
  requirePermission,
} from '../middlewares/auth.middleware.js'
import { validateJson, validateQuery } from '../middlewares/validator.middleware.js'

export function createInventoryRoutes(services: AppServices) {
  const requireAuth = createRequireAuthMiddleware(services)
  const canView = requirePermission('inventory:view')
  const canManage = requirePermission('inventory:manage')

  return new Hono<HonoAppEnv>()
    .use('*', requireAuth)
    .get('/movements', canView, validateQuery(movementQuerySchema), (c) => {
      const actor = c.get('currentUser')
      const query = c.req.valid('query')
      const movements = services.inventory.listMovements(actor, query)
      return c.json({ ok: true as const, data: movements }, 200)
    })
    .post('/movements', canManage, validateJson(recordStockMovementSchema), (c) => {
      const actor = c.get('currentUser')
      const input = c.req.valid('json')
      const recorded = services.inventory.recordManualMovement(actor, input)
      return c.json({ ok: true as const, data: recorded }, 201)
    })
}
