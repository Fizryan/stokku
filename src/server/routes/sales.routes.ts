import { Hono } from 'hono'
import {
  checkoutSaleSchema,
  idParamSchema,
  salesExportQuerySchema,
  salesQuerySchema,
  voidSaleSchema,
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

export function createSalesRoutes(services: AppServices) {
  const requireAuth = createRequireAuthMiddleware(services)
  const canCheckout = requirePermission('pos:checkout')
  const canView = requirePermission('sales:view')
  const canVoid = requirePermission('sales:void')
  const canExport = requirePermission('sales:export')

  return new Hono<HonoAppEnv>()
    .use('*', requireAuth)
    .get('/', canView, validateQuery(salesQuerySchema), (c) => {
      const actor = c.get('currentUser')
      const query = c.req.valid('query')
      const result = services.pos.listSales(actor, query)
      return c.json({ ok: true as const, data: result }, 200)
    })
    .get('/export.csv', canExport, validateQuery(salesExportQuerySchema), (c) => {
      const query = c.req.valid('query')
      const csvContent = services.reports.exportSalesCsv(query)
      const stamp = new Date().toISOString().slice(0, 10)
      return c.body(csvContent, 200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="laporan-penjualan-stokku-${stamp}.csv"`,
        'Cache-Control': 'no-store',
      })
    })
    .post('/', canCheckout, validateJson(checkoutSaleSchema), (c) => {
      const actor = c.get('currentUser')
      const input = c.req.valid('json')
      const created = services.pos.checkout(actor, input)
      return c.json({ ok: true as const, data: created }, 201)
    })
    .get('/:id', canView, validateParam(idParamSchema), (c) => {
      const actor = c.get('currentUser')
      const { id } = c.req.valid('param')
      const detail = services.pos.getSaleDetail(actor, id)
      return c.json({ ok: true as const, data: detail }, 200)
    })
    .post(
      '/:id/void',
      canVoid,
      validateParam(idParamSchema),
      validateJson(voidSaleSchema),
      (c) => {
        const actor = c.get('currentUser')
        const { id } = c.req.valid('param')
        const input = c.req.valid('json')
        const voided = services.pos.voidSale(actor, id, input)
        return c.json({ ok: true as const, data: voided }, 200)
      },
    )
}
