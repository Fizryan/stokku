import { Hono } from 'hono'
import {
  closeShiftSchema,
  idParamSchema,
  openShiftSchema,
  recordCashMovementSchema,
  shiftsQuerySchema,
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

export function createShiftsRoutes(services: AppServices) {
  const requireAuth = createRequireAuthMiddleware(services)
  const canManage = requirePermission('shifts:manage')
  const canView = requirePermission('shifts:view')

  return new Hono<HonoAppEnv>()
    .use('*', requireAuth)
    .get('/current', canView, (c) => {
      const actor = c.get('currentUser')
      const status = services.shifts.getCurrentShift(actor)
      return c.json({ ok: true as const, data: status }, 200)
    })
    .post('/open', canManage, validateJson(openShiftSchema), (c) => {
      const actor = c.get('currentUser')
      const input = c.req.valid('json')
      const shift = services.shifts.openShift(actor, input)
      return c.json({ ok: true as const, data: shift }, 201)
    })
    .post('/cash-movement', canManage, validateJson(recordCashMovementSchema), (c) => {
      const actor = c.get('currentUser')
      const input = c.req.valid('json')
      const movement = services.shifts.recordMovement(actor, input)
      return c.json({ ok: true as const, data: movement }, 201)
    })
    .post('/close', canManage, validateJson(closeShiftSchema), (c) => {
      const actor = c.get('currentUser')
      const input = c.req.valid('json')
      const shift = services.shifts.closeShift(actor, input)
      return c.json({ ok: true as const, data: shift }, 200)
    })
    .get('/', canView, validateQuery(shiftsQuerySchema), (c) => {
      const actor = c.get('currentUser')
      const query = c.req.valid('query')
      const result = services.shifts.listShifts(actor, query)
      return c.json({ ok: true as const, data: result }, 200)
    })
    .get('/:id', canView, validateParam(idParamSchema), (c) => {
      const actor = c.get('currentUser')
      const { id } = c.req.valid('param')
      const shift = services.shifts.getShiftDetail(actor, id)
      return c.json({ ok: true as const, data: shift }, 200)
    })
}
