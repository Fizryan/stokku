import { Hono } from 'hono'
import {
  createSupplierSchema,
  idParamSchema,
  suppliersQuerySchema,
  updateSupplierSchema,
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

export function createSuppliersRoutes(services: AppServices) {
  const requireAuth = createRequireAuthMiddleware(services)
  const canView = requirePermission('suppliers:view')
  const canManage = requirePermission('suppliers:manage')

  return new Hono<HonoAppEnv>()
    .use('*', requireAuth)
    .get('/', canView, validateQuery(suppliersQuerySchema), (c) => {
      const query = c.req.valid('query')
      const result = services.suppliers.listSuppliers(query)
      return c.json({ ok: true as const, data: result }, 200)
    })
    .get('/active', canView, (c) => {
      const result = services.suppliers.listActiveSuppliers()
      return c.json({ ok: true as const, data: result }, 200)
    })
    .post('/', canManage, validateJson(createSupplierSchema), (c) => {
      const input = c.req.valid('json')
      const created = services.suppliers.createSupplier(input)
      return c.json({ ok: true as const, data: created }, 201)
    })
    .get('/:id', canView, validateParam(idParamSchema), (c) => {
      const { id } = c.req.valid('param')
      const supplier = services.suppliers.getSupplierById(id)
      return c.json({ ok: true as const, data: supplier }, 200)
    })
    .put(
      '/:id',
      canManage,
      validateParam(idParamSchema),
      validateJson(updateSupplierSchema),
      (c) => {
        const { id } = c.req.valid('param')
        const input = c.req.valid('json')
        const updated = services.suppliers.updateSupplier(id, input)
        return c.json({ ok: true as const, data: updated }, 200)
      },
    )
}
