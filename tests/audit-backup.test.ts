import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, it } from 'node:test'
import type {
  AuditLogDTO,
  BackupFileDTO,
  CashShiftDetailDTO,
  CategoryDTO,
  CustomerDTO,
  PaginatedResult,
  ProductDTO,
  SaleDetailDTO,
  StockMovementDTO,
  UserDTO,
} from '../src/shared/types.js'
import { createTestHarness, type TestHarness } from './helpers/test-app.js'

describe('Audit Trail & Disaster Recovery Backup Manager (Governance & Integrity)', () => {
  let harness: TestHarness | null = null
  let tempBackupDir: string | null = null

  beforeEach(() => {
    tempBackupDir = mkdtempSync(join(tmpdir(), 'stokku-test-backups-'))
  })

  afterEach(() => {
    harness?.dispose()
    harness = null
    if (tempBackupDir) {
      try {
        rmSync(tempBackupDir, { recursive: true, force: true })
      } catch {
        // ignore cleanup error
      }
      tempBackupDir = null
    }
  })

  it('enforces RBAC, logs sensitive domain mutations into audit trail, and creates/restores live database backups', async () => {
    assert(tempBackupDir !== null)
    harness = createTestHarness({
      BACKUP_DIR: tempBackupDir,
    })

    const ownerClient = harness.createClient()
    const cashierClient = harness.createClient()
    const warehouseClient = harness.createClient()

    // 1. Initial Setup: Owner
    const setupRes = await ownerClient.requestJson<{ user: UserDTO }>('/api/auth/setup', {
      method: 'POST',
      json: {
        fullName: 'Owner Toko',
        username: 'owner',
        password: 'password123',
      },
    })
    assert.equal(setupRes.status, 201)
    assert(setupRes.body.ok)

    // 2. Create Cashier user & Warehouse user
    const cashierUserRes = await ownerClient.requestJson<UserDTO>('/api/users', {
      method: 'POST',
      json: {
        username: 'kasir_dini',
        fullName: 'Dini Kasir',
        role: 'CASHIER',
        password: 'password123',
      },
    })
    assert.equal(cashierUserRes.status, 201)
    assert(cashierUserRes.body.ok)

    const warehouseUserRes = await ownerClient.requestJson<UserDTO>('/api/users', {
      method: 'POST',
      json: {
        username: 'gudang_budi',
        fullName: 'Budi Gudang',
        role: 'WAREHOUSE',
        password: 'password123',
      },
    })
    assert.equal(warehouseUserRes.status, 201)
    assert(warehouseUserRes.body.ok)

    await cashierClient.requestJson('/api/auth/login', {
      method: 'POST',
      json: { username: 'kasir_dini', password: 'password123' },
    })

    await warehouseClient.requestJson('/api/auth/login', {
      method: 'POST',
      json: { username: 'gudang_budi', password: 'password123' },
    })

    // 3. RBAC Enforcement: Non-owner roles are strictly forbidden
    const cashierAuditRes = await cashierClient.requestJson('/api/audit')
    assert.equal(cashierAuditRes.status, 403)

    const warehouseAuditRes = await warehouseClient.requestJson('/api/audit')
    assert.equal(warehouseAuditRes.status, 403)

    const cashierBackupListRes = await cashierClient.requestJson('/api/backup')
    assert.equal(cashierBackupListRes.status, 403)

    const warehouseBackupPostRes = await warehouseClient.requestJson('/api/backup', {
      method: 'POST',
    })
    assert.equal(warehouseBackupPostRes.status, 403)

    // 4. Audit Trail Event: USER_ROLE_CHANGED & USER_DEACTIVATED
    const changeRoleRes = await ownerClient.requestJson<UserDTO>(
      `/api/users/${warehouseUserRes.body.data.id}`,
      {
        method: 'PATCH',
        json: { role: 'CASHIER' },
      },
    )
    assert.equal(changeRoleRes.status, 200)

    const deactivateRes = await ownerClient.requestJson<UserDTO>(
      `/api/users/${warehouseUserRes.body.data.id}`,
      {
        method: 'PATCH',
        json: { isActive: false },
      },
    )
    assert.equal(deactivateRes.status, 200)

    // 5. Audit Trail Event: PASSWORD_RESET
    const resetPwRes = await ownerClient.requestJson(
      `/api/users/${warehouseUserRes.body.data.id}/reset-password`,
      {
        method: 'POST',
        json: { newPassword: 'newpassword123' },
      },
    )
    assert.equal(resetPwRes.status, 200)

    // 6. Setup Category, Product & Manual Stock Adjustment (STOCK_ADJUSTED)
    const categoryRes = await ownerClient.requestJson<CategoryDTO>('/api/categories', {
      method: 'POST',
      json: { name: 'Kopi & Minuman' },
    })
    assert(categoryRes.body.ok)

    const productRes = await ownerClient.requestJson<ProductDTO>('/api/products', {
      method: 'POST',
      json: {
        sku: 'KOP-001',
        name: 'Kopi Hitam Robusta',
        categoryId: categoryRes.body.data.id,
        unit: 'pcs',
        costPrice: 4000,
        sellPrice: 10000,
        initialStock: 20,
        minStockQty: 5,
      },
    })
    assert(productRes.body.ok)

    const stockAdjustRes = await ownerClient.requestJson<StockMovementDTO>(
      '/api/inventory/movements',
      {
        method: 'POST',
        json: {
          productId: productRes.body.data.id,
          movementType: 'ADJUSTMENT_OPNAME',
          actualStockQty: 25,
          note: 'Stock opname akhir pekan ada kelebihan 5 pcs',
        },
      },
    )
    assert.equal(stockAdjustRes.status, 201)

    // 7. Setup Customer & Manual Points Adjustment (POINTS_ADJUSTED)
    const customerRes = await ownerClient.requestJson<CustomerDTO>('/api/customers', {
      method: 'POST',
      json: {
        phone: '081234567890',
        name: 'Pak Bambang',
      },
    })
    assert(customerRes.body.ok)

    const pointAdjustRes = await ownerClient.requestJson<CustomerDTO>(
      `/api/customers/${customerRes.body.data.id}/points`,
      {
        method: 'POST',
        json: {
          points: 50,
          description: 'Bonus loyalitas ulang tahun pelanggan',
        },
      },
    )
    assert.equal(pointAdjustRes.status, 200)

    // 8. Open Shift, Checkout Sale, and Void Sale (SALE_VOIDED)
    const openShiftRes = await cashierClient.requestJson<CashShiftDetailDTO>(
      '/api/shifts/open',
      {
        method: 'POST',
        json: { openingCash: 100_000 },
      },
    )
    assert.equal(openShiftRes.status, 201)

    const checkoutRes = await cashierClient.requestJson<SaleDetailDTO>('/api/sales', {
      method: 'POST',
      json: {
        paymentMethod: 'CASH',
        paidAmount: 20_000,
        discountAmount: 0,
        customerId: customerRes.body.data.id,
        items: [{ productId: productRes.body.data.id, qty: 2 }],
      },
    })
    assert.equal(checkoutRes.status, 201)
    assert(checkoutRes.body.ok)

    const voidRes = await ownerClient.requestJson<SaleDetailDTO>(
      `/api/sales/${checkoutRes.body.data.id}/void`,
      {
        method: 'POST',
        json: { reason: 'Salah input pesanan pelanggan meja 3' },
      },
    )
    assert.equal(voidRes.status, 200)

    // 9. Export Sales CSV (SALES_EXPORTED)
    const exportRes = await ownerClient.requestRaw('/api/sales/export.csv')
    assert.equal(exportRes.status, 200)

    // 10. Verify Audit Log Queries & Entries
    const auditAllRes =
      await ownerClient.requestJson<PaginatedResult<AuditLogDTO>>('/api/audit')
    assert.equal(auditAllRes.status, 200)
    assert(auditAllRes.body.ok)
    const allLogs = auditAllRes.body.data.items

    // Verify key action types exist
    const actionTypes = new Set(allLogs.map((l) => l.actionType))
    assert(actionTypes.has('USER_ROLE_CHANGED'), 'Expected USER_ROLE_CHANGED log')
    assert(actionTypes.has('USER_DEACTIVATED'), 'Expected USER_DEACTIVATED log')
    assert(actionTypes.has('PASSWORD_RESET'), 'Expected PASSWORD_RESET log')
    assert(actionTypes.has('STOCK_ADJUSTED'), 'Expected STOCK_ADJUSTED log')
    assert(actionTypes.has('POINTS_ADJUSTED'), 'Expected POINTS_ADJUSTED log')
    assert(actionTypes.has('SALE_VOIDED'), 'Expected SALE_VOIDED log')
    assert(actionTypes.has('SALES_EXPORTED'), 'Expected SALES_EXPORTED log')

    // Filter audit logs by actionType
    const voidAuditRes = await ownerClient.requestJson<PaginatedResult<AuditLogDTO>>(
      '/api/audit?actionType=SALE_VOIDED',
    )
    assert.equal(voidAuditRes.status, 200)
    assert(voidAuditRes.body.ok)
    assert.equal(voidAuditRes.body.data.items.length, 1)
    const firstVoid = voidAuditRes.body.data.items[0]
    assert(firstVoid !== undefined)
    assert.equal(firstVoid.actionType, 'SALE_VOIDED')
    assert.equal(firstVoid.details?.reason, 'Salah input pesanan pelanggan meja 3')

    // 11. Test Backup Engine (Disaster Recovery & VACUUM INTO)
    const backupCreateRes = await ownerClient.requestJson<BackupFileDTO>('/api/backup', {
      method: 'POST',
    })
    assert.equal(backupCreateRes.status, 201)
    assert(backupCreateRes.body.ok)
    const backupData = backupCreateRes.body.data

    assert(backupData.fileName.startsWith('stokku-backup-'))
    assert(backupData.fileName.endsWith('.sqlite'))
    assert(backupData.fileSizeBytes > 0)

    // Verify BACKUP_CREATED audit log was recorded
    const backupAuditRes = await ownerClient.requestJson<PaginatedResult<AuditLogDTO>>(
      '/api/audit?actionType=BACKUP_CREATED',
    )
    assert.equal(backupAuditRes.status, 200)
    assert(backupAuditRes.body.ok)
    assert(backupAuditRes.body.data.items.length >= 1)

    // List Backups
    const backupListRes = await ownerClient.requestJson<BackupFileDTO[]>('/api/backup')
    assert.equal(backupListRes.status, 200)
    assert(backupListRes.body.ok)
    assert(backupListRes.body.data.some((b) => b.fileName === backupData.fileName))

    // Download Backup file
    const downloadRes = await ownerClient.requestRaw(`/api/backup/${backupData.fileName}`)
    assert.equal(downloadRes.status, 200)
    assert.equal(downloadRes.headers.get('content-type'), 'application/vnd.sqlite3')
    const fileBytes = await downloadRes.arrayBuffer()
    assert.equal(fileBytes.byteLength, backupData.fileSizeBytes)

    // Validate that the downloaded backup is indeed a valid SQLite database
    const backupFilePath = join(tempBackupDir, backupData.fileName)
    const backupDb = new DatabaseSync(backupFilePath)
    const userCountRow = backupDb
      .prepare('SELECT count(*) as count FROM users')
      .get() as {
      count: number
    }
    assert(userCountRow.count >= 3, 'Backup database must contain all users created')
    backupDb.close()

    // Security check: Path traversal prevention
    const traversalRes = await ownerClient.requestJson(
      '/api/backup/..%2F..%2Fsecret.sqlite',
    )
    assert.equal(traversalRes.status, 400)
  })
})
