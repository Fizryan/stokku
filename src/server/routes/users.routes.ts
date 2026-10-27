import { Hono } from 'hono'
import {
  createUserSchema,
  idParamSchema,
  resetUserPasswordSchema,
  updateUserSchema,
} from '../../shared/schemas/index.js'
import type { AppServices, HonoAppEnv } from '../contracts/services.contract.js'
import {
  createRequireAuthMiddleware,
  requirePermission,
} from '../middlewares/auth.middleware.js'
import { validateJson, validateParam } from '../middlewares/validator.middleware.js'

export function createUsersRoutes(services: AppServices) {
  const requireAuth = createRequireAuthMiddleware(services)
  const canManageUsers = requirePermission('users:manage')

  return new Hono<HonoAppEnv>()
    .use('*', requireAuth, canManageUsers)
    .get('/', (c) => {
      const users = services.users.listUsers()
      return c.json({ ok: true as const, data: users }, 200)
    })
    .post('/', validateJson(createUserSchema), async (c) => {
      const actor = c.get('currentUser')
      const input = c.req.valid('json')
      const created = await services.users.createUser(input, actor)
      return c.json({ ok: true as const, data: created }, 201)
    })
    .patch('/:id', validateParam(idParamSchema), validateJson(updateUserSchema), (c) => {
      const actor = c.get('currentUser')
      const { id } = c.req.valid('param')
      const input = c.req.valid('json')
      const updated = services.users.updateUser(actor, id, input)
      return c.json({ ok: true as const, data: updated }, 200)
    })
    .post(
      '/:id/reset-password',
      validateParam(idParamSchema),
      validateJson(resetUserPasswordSchema),
      async (c) => {
        const actor = c.get('currentUser')
        const { id } = c.req.valid('param')
        const input = c.req.valid('json')
        await services.users.resetUserPassword(id, input, actor)
        return c.json({ ok: true as const, data: { reset: true } }, 200)
      },
    )
}
