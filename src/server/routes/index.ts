import { Hono } from 'hono'
import type { AppServices, HonoAppEnv } from '../contracts/services.contract.js'
import { createAuthRoutes } from './auth.routes.js'
import { createCategoriesRoutes } from './categories.routes.js'
import { createDashboardRoutes } from './dashboard.routes.js'
import { createHealthRoutes } from './health.routes.js'
import { createInventoryRoutes } from './inventory.routes.js'
import { createProductsRoutes } from './products.routes.js'
import { createSalesRoutes } from './sales.routes.js'
import { createUsersRoutes } from './users.routes.js'

export function createApiRoutes(services: AppServices) {
  return new Hono<HonoAppEnv>()
    .basePath('/api')
    .route('/health', createHealthRoutes(services))
    .route('/auth', createAuthRoutes(services))
    .route('/users', createUsersRoutes(services))
    .route('/categories', createCategoriesRoutes(services))
    .route('/products', createProductsRoutes(services))
    .route('/inventory', createInventoryRoutes(services))
    .route('/sales', createSalesRoutes(services))
    .route('/dashboard', createDashboardRoutes(services))
}

export type AppType = ReturnType<typeof createApiRoutes>
