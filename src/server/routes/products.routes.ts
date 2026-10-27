import { Hono } from 'hono'
import {
  createProductSchema,
  idParamSchema,
  lookupProductQuerySchema,
  productQuerySchema,
  updateProductSchema,
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

export function createProductsRoutes(services: AppServices) {
  const requireAuth = createRequireAuthMiddleware(services)
  const canView = requirePermission('catalog:view')
  const canManage = requirePermission('catalog:manage')

  return new Hono<HonoAppEnv>()
    .use('*', requireAuth)
    .get('/', canView, validateQuery(productQuerySchema), (c) => {
      const actor = c.get('currentUser')
      const query = c.req.valid('query')
      const result = services.catalog.listProducts(actor, query)
      return c.json({ ok: true as const, data: result }, 200)
    })
    .get('/lookup', canView, validateQuery(lookupProductQuerySchema), (c) => {
      const actor = c.get('currentUser')
      const { code } = c.req.valid('query')
      const product = services.catalog.lookupProductByCode(actor, code)
      return c.json({ ok: true as const, data: product }, 200)
    })
    .get('/:id', canView, validateParam(idParamSchema), (c) => {
      const actor = c.get('currentUser')
      const { id } = c.req.valid('param')
      const product = services.catalog.getProductById(actor, id)
      return c.json({ ok: true as const, data: product }, 200)
    })
    .post('/', canManage, validateJson(createProductSchema), (c) => {
      const actor = c.get('currentUser')
      const input = c.req.valid('json')
      const created = services.catalog.createProduct(actor, input)
      return c.json({ ok: true as const, data: created }, 201)
    })
    .put(
      '/:id',
      canManage,
      validateParam(idParamSchema),
      validateJson(updateProductSchema),
      (c) => {
        const actor = c.get('currentUser')
        const { id } = c.req.valid('param')
        const input = c.req.valid('json')
        const updated = services.catalog.updateProduct(actor, id, input)
        return c.json({ ok: true as const, data: updated }, 200)
      },
    )
}
