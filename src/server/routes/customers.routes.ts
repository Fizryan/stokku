import { Hono } from 'hono'
import { z } from 'zod'
import {
  adjustCustomerPointsSchema,
  createCustomerSchema,
  customersQuerySchema,
  idParamSchema,
  updateCustomerSchema,
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

const phoneParamSchema = z.object({
  phone: z.string().trim().min(3),
})

export function createCustomersRoutes(services: AppServices) {
  const requireAuth = createRequireAuthMiddleware(services)
  const canView = requirePermission('customers:view')
  const canManage = requirePermission('customers:manage')
  const canAdjustPoints = requirePermission('customers:adjust_points')

  return new Hono<HonoAppEnv>()
    .use('*', requireAuth)
    .get('/', canView, validateQuery(customersQuerySchema), (c) => {
      const query = c.req.valid('query')
      const result = services.customers.listCustomers(query)
      return c.json({ ok: true as const, data: result }, 200)
    })
    .get('/top', canView, (c) => {
      const result = services.customers.getTopCustomers(10)
      return c.json({ ok: true as const, data: result }, 200)
    })
    .get('/by-phone/:phone', canView, validateParam(phoneParamSchema), (c) => {
      const { phone } = c.req.valid('param')
      const customer = services.customers.getCustomerByPhone(phone)
      return c.json({ ok: true as const, data: customer }, 200)
    })
    .get('/:id', canView, validateParam(idParamSchema), (c) => {
      const { id } = c.req.valid('param')
      const customer = services.customers.getCustomerById(id)
      return c.json({ ok: true as const, data: customer }, 200)
    })
    .get('/:id/mutations', canView, validateParam(idParamSchema), (c) => {
      const { id } = c.req.valid('param')
      const mutations = services.customers.listPointMutations(id, 50)
      return c.json({ ok: true as const, data: mutations }, 200)
    })
    .post('/', canManage, validateJson(createCustomerSchema), (c) => {
      const input = c.req.valid('json')
      const created = services.customers.createCustomer(input)
      return c.json({ ok: true as const, data: created }, 201)
    })
    .patch(
      '/:id',
      canManage,
      validateParam(idParamSchema),
      validateJson(updateCustomerSchema),
      (c) => {
        const { id } = c.req.valid('param')
        const input = c.req.valid('json')
        const updated = services.customers.updateCustomer(id, input)
        return c.json({ ok: true as const, data: updated }, 200)
      },
    )
    .post(
      '/:id/points',
      canAdjustPoints,
      validateParam(idParamSchema),
      validateJson(adjustCustomerPointsSchema),
      (c) => {
        const { id } = c.req.valid('param')
        const input = c.req.valid('json')
        const actor = c.get('currentUser')
        const updated = services.customers.adjustPoints(actor, id, input)
        return c.json({ ok: true as const, data: updated }, 200)
      },
    )
}
