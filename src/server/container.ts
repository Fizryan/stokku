import type { DatabaseSync } from 'node:sqlite'
import type { ServerConfig } from './config/env.js'
import type { AppServices } from './contracts/services.contract.js'
import { closeDatabaseGracefully, createDatabaseConnection } from './db/connection.js'
import { runDatabaseMigrations } from './db/migrator.js'
import { AuditRepository } from './repositories/audit.repo.js'
import { CategoryRepository } from './repositories/category.repo.js'
import { CustomerRepository } from './repositories/customer.repo.js'
import { DashboardRepository } from './repositories/dashboard.repo.js'
import { ProductRepository } from './repositories/product.repo.js'
import { PurchaseRepository } from './repositories/purchase.repo.js'
import { SaleRepository } from './repositories/sale.repo.js'
import { SessionRepository } from './repositories/session.repo.js'
import { ShiftRepository } from './repositories/shift.repo.js'
import { StockMovementRepository } from './repositories/stock-movement.repo.js'
import { SupplierRepository } from './repositories/supplier.repo.js'
import { UserRepository } from './repositories/user.repo.js'
import { SlidingWindowRateLimiter } from './security/rate-limiter.js'
import { AuditService } from './services/audit.service.js'
import { AuthService } from './services/auth.service.js'
import { BackupService } from './services/backup.service.js'
import { CatalogService } from './services/catalog.service.js'
import { CustomerService } from './services/customer.service.js'
import { InventoryService } from './services/inventory.service.js'
import { PosService } from './services/pos.service.js'
import { PurchaseService } from './services/purchase.service.js'
import { ReportService } from './services/report.service.js'
import { ShiftService } from './services/shift.service.js'
import { SupplierService } from './services/supplier.service.js'
import { UserService } from './services/user.service.js'

export interface AppContainer {
  readonly db: DatabaseSync
  readonly services: AppServices
  readonly dispose: () => void
}

export function createAppContainer(config: ServerConfig): AppContainer {
  const db = createDatabaseConnection(config.databasePath)
  runDatabaseMigrations(db)

  const userRepo = new UserRepository(db)
  const sessionRepo = new SessionRepository(db)
  const categoryRepo = new CategoryRepository(db)
  const productRepo = new ProductRepository(db)
  const stockMovementRepo = new StockMovementRepository(db)
  const shiftRepo = new ShiftRepository(db)
  const saleRepo = new SaleRepository(db)
  const supplierRepo = new SupplierRepository(db)
  const purchaseRepo = new PurchaseRepository(db)
  const customerRepo = new CustomerRepository(db)
  const dashboardRepo = new DashboardRepository(db)
  const auditRepo = new AuditRepository(db)

  const loginRateLimiter = new SlidingWindowRateLimiter({
    maxFailures: 5,
    windowMs: 5 * 60 * 1000,
    blockDurationMs: 5 * 60 * 1000,
    maxTrackedKeys: 5000,
  })

  const sessionPruneInterval = setInterval(
    () => {
      if (db.isOpen) {
        sessionRepo.deleteExpired(new Date().toISOString())
      }
    },
    15 * 60 * 1000,
  )
  sessionPruneInterval.unref()

  // Initial expired session cleanup on startup
  sessionRepo.deleteExpired(new Date().toISOString())

  const auditService = new AuditService({
    auditRepo,
  })

  const backupService = new BackupService({
    db,
    backupDir: config.backupDir,
    auditService,
  })

  const inventoryService = new InventoryService({
    db,
    productRepo,
    stockMovementRepo,
    auditService,
  })

  const catalogService = new CatalogService({
    db,
    categoryRepo,
    productRepo,
    inventoryService,
  })

  const posService = new PosService({
    db,
    productRepo,
    saleRepo,
    inventoryService,
    shiftRepo,
    customerRepo,
    auditService,
  })

  const customerService = new CustomerService({
    db,
    customerRepo,
    auditService,
  })

  const shiftService = new ShiftService({
    db,
    shiftRepo,
  })

  const supplierService = new SupplierService({
    db,
    supplierRepo,
  })

  const purchaseService = new PurchaseService({
    db,
    purchaseRepo,
    supplierRepo,
    productRepo,
    stockMovementRepo,
  })

  const reportService = new ReportService({
    dashboardRepo,
    saleRepo,
    auditService,
  })

  const authService = new AuthService({
    db,
    userRepo,
    sessionRepo,
    loginRateLimiter,
    sessionTtlMs: config.sessionTtlMs,
  })

  const userService = new UserService({
    db,
    userRepo,
    sessionRepo,
    auditService,
  })

  const healthCheckStmt = db.prepare('SELECT 1 AS ok')

  const services: AppServices = {
    auth: authService,
    users: userService,
    catalog: catalogService,
    inventory: inventoryService,
    pos: posService,
    shifts: shiftService,
    suppliers: supplierService,
    purchases: purchaseService,
    customers: customerService,
    reports: reportService,
    audit: auditService,
    backup: backupService,
    health: {
      checkHealth() {
        healthCheckStmt.get()
        return {
          status: 'ok' as const,
          timestamp: new Date().toISOString(),
          uptimeSeconds: Math.floor(process.uptime()),
        }
      },
    },
    cookieConfig: {
      sessionTtlMs: config.sessionTtlMs,
      cookieSecure: config.cookieSecure,
      nodeEnv: config.nodeEnv,
    },
  }

  let disposed = false
  const dispose = (): void => {
    if (disposed) return
    disposed = true
    clearInterval(sessionPruneInterval)
    loginRateLimiter.dispose()
    closeDatabaseGracefully(db)
  }

  return {
    db,
    services,
    dispose,
  }
}
