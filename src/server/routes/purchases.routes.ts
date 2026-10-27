import { Hono } from 'hono'
import {
  createPurchaseSchema,
  idParamSchema,
  purchasesQuerySchema,
  updatePurchasePaymentStatusSchema,
} from '../../shared/schemas/index.js'
import type { AppServices, HonoAppEnv } from '../contracts/services.contract.js'
import {
  createRequireAuthMiddleware,
  requirePermission,
} from '../middlewares/auth.middleware.js'
import {
  validateJson,
  validateParam,
  validateQuery,
} from '../middlewares/validator.middleware.js'

export function createPurchasesRoutes(services: AppServices) {
  const requireAuth = createRequireAuthMiddleware(services)
  const canView = requirePermission('purchases:view')
  const canManage = requirePermission('purchases:manage')

  return new Hono<HonoAppEnv>()
    .use('*', requireAuth)
    .get('/', canView, validateQuery(purchasesQuerySchema), (c) => {
      const query = c.req.valid('query')
      const result = services.purchases.listPurchases(query)
      return c.json({ ok: true as const, data: result }, 200)
    })
    .post('/', canManage, validateJson(createPurchaseSchema), (c) => {
      const actor = c.get('currentUser')
      const input = c.req.valid('json')
      const created = services.purchases.createPurchase(actor, input)
      return c.json({ ok: true as const, data: created }, 201)
    })
    .get('/:id', canView, validateParam(idParamSchema), (c) => {
      const { id } = c.req.valid('param')
      const detail = services.purchases.getPurchaseDetail(id)
      return c.json({ ok: true as const, data: detail }, 200)
    })
    .patch(
      '/:id/payment',
      canManage,
      validateParam(idParamSchema),
      validateJson(updatePurchasePaymentStatusSchema),
      (c) => {
        const { id } = c.req.valid('param')
        const input = c.req.valid('json')
        const updated = services.purchases.updatePaymentStatus(id, input)
        return c.json({ ok: true as const, data: updated }, 200)
      },
    )
}
