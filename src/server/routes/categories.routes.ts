import { Hono } from 'hono'
import { categoryInputSchema, idParamSchema } from '../../shared/schemas/index.js'
import type { AppServices, HonoAppEnv } from '../contracts/services.contract.js'
import {
  createRequireAuthMiddleware,
  requirePermission,
} from '../middlewares/auth.middleware.js'
import { validateJson, validateParam } from '../middlewares/validator.middleware.js'

export function createCategoriesRoutes(services: AppServices) {
  const requireAuth = createRequireAuthMiddleware(services)
  const canView = requirePermission('catalog:view')
  const canManage = requirePermission('catalog:manage')

  return new Hono<HonoAppEnv>()
    .use('*', requireAuth)
    .get('/', canView, (c) => {
      const categories = services.catalog.listCategories()
      return c.json({ ok: true as const, data: categories }, 200)
    })
    .post('/', canManage, validateJson(categoryInputSchema), (c) => {
      const input = c.req.valid('json')
      const created = services.catalog.createCategory(input)
      return c.json({ ok: true as const, data: created }, 201)
    })
    .put(
      '/:id',
      canManage,
      validateParam(idParamSchema),
      validateJson(categoryInputSchema),
      (c) => {
        const { id } = c.req.valid('param')
        const input = c.req.valid('json')
        const updated = services.catalog.updateCategory(id, input)
        return c.json({ ok: true as const, data: updated }, 200)
      },
    )
    .delete('/:id', canManage, validateParam(idParamSchema), (c) => {
      const { id } = c.req.valid('param')
      services.catalog.deleteCategory(id)
      return c.json({ ok: true as const, data: { deleted: true } }, 200)
    })
}
