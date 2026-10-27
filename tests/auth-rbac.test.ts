import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import type {
  AuthSessionDTO,
  PaginatedResult,
  ProductDTO,
  SaleDetailDTO,
  UserDTO,
} from '../src/shared/types.js'
import { createTestHarness, type TestHarness } from './helpers/test-app.js'

describe('Authentication, Session Revocation & RBAC Matrix', () => {
  let harness: TestHarness | null = null

  afterEach(() => {
    harness?.dispose()
    harness = null
  })

  it('locks /api/auth/setup after initial Owner, enforces RBAC & HPP stripping for CASHIER/WAREHOUSE, and revokes sessions on deactivation', async () => {
    harness = createTestHarness()
    const ownerClient = harness.createClient()

    // 1. Before setup: needsInitialSetup = true
    const preSession = await ownerClient.requestJson<AuthSessionDTO>('/api/auth/session')
    assert(preSession.body.ok)
    assert.equal(preSession.body.data.needsInitialSetup, true)
    assert.equal(preSession.body.data.user, null)

    // 2. First Owner setup succeeds (201)
    const setup1 = await ownerClient.requestJson<{ user: UserDTO }>('/api/auth/setup', {
      method: 'POST',
      json: {
        fullName: 'Owner Satu',
        username: 'owner1',
        password: 'password123',
      },
    })
    assert.equal(setup1.status, 201)
    assert(setup1.body.ok)
    const ownerUser = setup1.body.data.user

    // 3. Second setup attempt is permanently locked (403)
    const rogueClient = harness.createClient()
    const setup2 = await rogueClient.requestJson<{ user: UserDTO }>('/api/auth/setup', {
      method: 'POST',
      json: {
        fullName: 'Penyerang',
        username: 'attacker',
        password: 'password123',
      },
    })
    assert.equal(setup2.status, 403)

    // 4. Owner cannot deactivate or demote the last active Owner
    const selfDeactivate = await ownerClient.requestJson<UserDTO>(
      `/api/users/${ownerUser.id}`,
      {
        method: 'PATCH',
        json: { isActive: false },
      },
    )
    assert.equal(selfDeactivate.status, 400)

    const selfDemote = await ownerClient.requestJson<UserDTO>(
      `/api/users/${ownerUser.id}`,
      {
        method: 'PATCH',
        json: { role: 'CASHIER' },
      },
    )
    assert.equal(selfDemote.status, 400)

    // 5. Provision WAREHOUSE and CASHIER accounts
    const warehouseCreate = await ownerClient.requestJson<UserDTO>('/api/users', {
      method: 'POST',
      json: {
        username: 'gudang1',
        fullName: 'Staff Gudang',
        password: 'password123',
        role: 'WAREHOUSE',
      },
    })
    assert.equal(warehouseCreate.status, 201)
    assert(warehouseCreate.body.ok)

    const cashierCreate = await ownerClient.requestJson<UserDTO>('/api/users', {
      method: 'POST',
      json: {
        username: 'kasir1',
        fullName: 'Kasir Pagi',
        password: 'password123',
        role: 'CASHIER',
      },
    })
    assert.equal(cashierCreate.status, 201)
    assert(cashierCreate.body.ok)
    const cashierUser = cashierCreate.body.data

    // 6. Login as WAREHOUSE -> can create product & stock, CANNOT checkout POS or manage users
    const warehouseClient = harness.createClient()
    const whLogin = await warehouseClient.requestJson<{ user: UserDTO }>(
      '/api/auth/login',
      {
        method: 'POST',
        json: { username: 'gudang1', password: 'password123' },
      },
    )
    assert.equal(whLogin.status, 200)

    const prodCreate = await warehouseClient.requestJson<ProductDTO>('/api/products', {
      method: 'POST',
      json: {
        sku: 'BRG-100',
        barcode: null,
        name: 'Beras Premium 5kg',
        categoryId: null,
        unit: 'pack',
        costPrice: 58_000,
        sellPrice: 72_000,
        minStockQty: 5,
        initialStock: 10,
      },
    })
    assert.equal(prodCreate.status, 201)
    assert(prodCreate.body.ok)
    assert.equal(prodCreate.body.data.costPrice, 58_000)

    const whPosAttempt = await warehouseClient.requestJson<SaleDetailDTO>('/api/sales', {
      method: 'POST',
      json: {
        items: [{ productId: prodCreate.body.data.id, qty: 1 }],
        discountAmount: 0,
        paymentMethod: 'CASH',
        paidAmount: 72_000,
        customerName: null,
      },
    })
    assert.equal(whPosAttempt.status, 403)

    const whUsersAttempt =
      await warehouseClient.requestJson<readonly UserDTO[]>('/api/users')
    assert.equal(whUsersAttempt.status, 403)

    // 7. Login as CASHIER -> costPrice & grossProfitAmount MUST be stripped (null), cannot mutate catalog/inventory/void
    const cashierClient = harness.createClient()
    const cashierLogin = await cashierClient.requestJson<{ user: UserDTO }>(
      '/api/auth/login',
      {
        method: 'POST',
        json: { username: 'kasir1', password: 'password123' },
      },
    )
    assert.equal(cashierLogin.status, 200)

    const cashierProducts =
      await cashierClient.requestJson<PaginatedResult<ProductDTO>>('/api/products')
    assert.equal(cashierProducts.status, 200)
    assert(cashierProducts.body.ok)
    assert.equal(cashierProducts.body.data.items[0]?.costPrice, null)

    const openShiftRes = await cashierClient.requestJson('/api/shifts/open', {
      method: 'POST',
      json: { openingCash: 100_000, notes: 'Modal awal kasir 1' },
    })
    assert.equal(openShiftRes.status, 201)

    const cashierSale = await cashierClient.requestJson<SaleDetailDTO>('/api/sales', {
      method: 'POST',
      json: {
        items: [{ productId: prodCreate.body.data.id, qty: 1 }],
        discountAmount: 0,
        paymentMethod: 'QRIS',
        paidAmount: 72_000,
        customerName: null,
      },
    })
    assert.equal(cashierSale.status, 201)
    assert(cashierSale.body.ok)
    assert.equal(cashierSale.body.data.grossProfitAmount, null)
    assert.equal(cashierSale.body.data.items[0]?.costPriceAtSale, null)

    const cashierVoidAttempt = await cashierClient.requestJson<SaleDetailDTO>(
      `/api/sales/${cashierSale.body.data.id}/void`,
      {
        method: 'POST',
        json: { reason: 'Kasir mencoba void tanpa izin' },
      },
    )
    assert.equal(cashierVoidAttempt.status, 403)

    // 8. Owner deactivates CASHIER -> existing session cookie is immediately invalidated (401)
    const deactivateCashier = await ownerClient.requestJson<UserDTO>(
      `/api/users/${cashierUser.id}`,
      {
        method: 'PATCH',
        json: { isActive: false },
      },
    )
    assert.equal(deactivateCashier.status, 200)

    const afterDeactivatedReq =
      await cashierClient.requestJson<PaginatedResult<ProductDTO>>('/api/products')
    assert.equal(afterDeactivatedReq.status, 401)
  })

  it('rejects cross-origin CSRF mutations, enforces sliding-window login rate limiting, and preserves active session on self password change', async () => {
    harness = createTestHarness()
    const ownerSessionA = harness.createClient()

    await ownerSessionA.requestJson<{ user: UserDTO }>('/api/auth/setup', {
      method: 'POST',
      json: {
        fullName: 'Owner Keamanan',
        username: 'secowner',
        password: 'password123',
      },
    })

    // 1. Cross-Origin POST must be blocked by hono/csrf (403)
    const csrfRes = await ownerSessionA.requestRaw('/api/auth/logout', {
      method: 'POST',
      headers: { Origin: 'https://malicious.example.com' },
    })
    assert.equal(csrfRes.status, 403)

    // 2. Open second session (Session B), then change password from Session A -> Session B revoked, Session A stays valid
    const ownerSessionB = harness.createClient()
    const loginB = await ownerSessionB.requestJson<{ user: UserDTO }>('/api/auth/login', {
      method: 'POST',
      json: { username: 'secowner', password: 'password123' },
    })
    assert.equal(loginB.status, 200)

    const changePw = await ownerSessionA.requestJson<{ updated: boolean }>(
      '/api/auth/change-password',
      {
        method: 'POST',
        json: {
          currentPassword: 'password123',
          newPassword: 'newpassword456',
        },
      },
    )
    assert.equal(changePw.status, 200)

    const sessionACheck =
      await ownerSessionA.requestJson<readonly UserDTO[]>('/api/users')
    assert.equal(sessionACheck.status, 200)

    const sessionBCheck =
      await ownerSessionB.requestJson<readonly UserDTO[]>('/api/users')
    assert.equal(sessionBCheck.status, 401)

    // 3. Brute-force 5 wrong passwords -> 6th attempt returns 429 RATE_LIMITED
    const attacker = harness.createClient()
    for (let i = 0; i < 5; i += 1) {
      const attempt = await attacker.requestJson<{ user: UserDTO }>('/api/auth/login', {
        method: 'POST',
        json: { username: 'secowner', password: 'wrong-password' },
      })
      assert.equal(attempt.status, 401)
    }

    const sixthAttempt = await attacker.requestJson<{ user: UserDTO }>(
      '/api/auth/login',
      {
        method: 'POST',
        json: { username: 'secowner', password: 'newpassword456' },
      },
    )
    assert.equal(sixthAttempt.status, 429)
  })
})
