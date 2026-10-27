import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import type {
  CashShiftDetailDTO,
  CashShiftMovementDTO,
  CurrentShiftStatusDTO,
  PaginatedResult,
  ProductDTO,
  SaleDetailDTO,
  UserDTO,
} from '../src/shared/types.js'
import { createTestHarness, type TestHarness } from './helpers/test-app.js'

describe('Cash Shift & Cash Drawer Management', () => {
  let harness: TestHarness | null = null

  afterEach(() => {
    harness?.dispose()
    harness = null
  })

  it('enforces mandatory shift before checkout, reconciles petty cash & sales, and enforces RBAC isolation', async () => {
    harness = createTestHarness()
    const ownerClient = harness.createClient()
    const cashierClient = harness.createClient()
    const warehouseClient = harness.createClient()

    // 1. Initial Setup: Owner
    const setupRes = await ownerClient.requestJson<{ user: UserDTO }>('/api/auth/setup', {
      method: 'POST',
      json: {
        fullName: 'Owner Utama',
        username: 'owner',
        password: 'password123',
      },
    })
    assert.equal(setupRes.status, 201)
    assert(setupRes.body.ok)

    // 2. Create Cashier and Warehouse users
    const cashierUserRes = await ownerClient.requestJson<UserDTO>('/api/users', {
      method: 'POST',
      json: {
        username: 'kasir_budi',
        fullName: 'Budi Kasir',
        role: 'CASHIER',
        password: 'password123',
      },
    })
    assert.equal(cashierUserRes.status, 201)
    assert(cashierUserRes.body.ok)
    const cashierUser = cashierUserRes.body.data

    const warehouseUserRes = await ownerClient.requestJson<UserDTO>('/api/users', {
      method: 'POST',
      json: {
        username: 'gudang_agus',
        fullName: 'Agus Gudang',
        role: 'WAREHOUSE',
        password: 'password123',
      },
    })
    assert.equal(warehouseUserRes.status, 201)
    assert(warehouseUserRes.body.ok)

    // 3. Login Cashier & Warehouse
    const cashierLogin = await cashierClient.requestJson<{ user: UserDTO }>(
      '/api/auth/login',
      {
        method: 'POST',
        json: { username: 'kasir_budi', password: 'password123' },
      },
    )
    assert.equal(cashierLogin.status, 200)
    assert(cashierLogin.body.ok)

    const warehouseLogin = await warehouseClient.requestJson<{ user: UserDTO }>(
      '/api/auth/login',
      {
        method: 'POST',
        json: { username: 'gudang_agus', password: 'password123' },
      },
    )
    assert.equal(warehouseLogin.status, 200)
    assert(warehouseLogin.body.ok)

    // 4. Create Product for testing
    const prodRes = await ownerClient.requestJson<ProductDTO>('/api/products', {
      method: 'POST',
      json: {
        sku: 'MINUM-01',
        name: 'Kopi Susu Gula Aren',
        unit: 'cup',
        costPrice: 8_000,
        sellPrice: 18_000,
        minStockQty: 5,
        initialStock: 50,
      },
    })
    assert.equal(prodRes.status, 201)
    assert(prodRes.body.ok)
    const product = prodRes.body.data

    // 5. Invariant: Warehouse cannot open or view shifts (RBAC test)
    const warehouseShiftAttempt = await warehouseClient.requestJson('/api/shifts/current')
    assert.equal(warehouseShiftAttempt.status, 403)

    // 6. Invariant: Cashier cannot checkout before opening a shift
    const blockedCheckout = await cashierClient.requestJson<SaleDetailDTO>('/api/sales', {
      method: 'POST',
      json: {
        items: [{ productId: product.id, qty: 1 }],
        discountAmount: 0,
        paymentMethod: 'CASH',
        paidAmount: 20_000,
        customerName: null,
      },
    })
    assert.equal(blockedCheckout.status, 400)
    assert(!blockedCheckout.body.ok)
    assert.match(
      blockedCheckout.body.error?.message ?? '',
      /wajib membuka shift terlebih dahulu/i,
    )

    // 7. Cashier verifies current shift status is inactive
    const statusBefore =
      await cashierClient.requestJson<CurrentShiftStatusDTO>('/api/shifts/current')
    assert.equal(statusBefore.status, 200)
    assert(statusBefore.body.ok)
    assert.equal(statusBefore.body.data.hasActiveShift, false)
    assert.equal(statusBefore.body.data.shift, null)

    // 8. Cashier opens shift with modal awal Rp 200.000
    const openRes = await cashierClient.requestJson<CashShiftDetailDTO>(
      '/api/shifts/open',
      {
        method: 'POST',
        json: {
          openingCash: 200_000,
          notes: 'Shift Pagi - Kasir Budi',
        },
      },
    )
    assert.equal(openRes.status, 201)
    assert(openRes.body.ok)
    const activeShift = openRes.body.data
    assert.equal(activeShift.openingCash, 200_000)
    assert.equal(activeShift.status, 'OPEN')
    assert.equal(activeShift.cashierUserId, cashierUser.id)
    assert.equal(activeShift.expectedCash, 200_000)

    // 9. Invariant: Cannot open another shift while one is already OPEN
    const doubleOpen = await cashierClient.requestJson<CashShiftDetailDTO>(
      '/api/shifts/open',
      {
        method: 'POST',
        json: { openingCash: 100_000, notes: 'Double open attempt' },
      },
    )
    assert.equal(doubleOpen.status, 409)

    // 10. Petty Cash Movements
    // Movement A: Cash In (Rp 50.000 tukar uang receh)
    const cashInRes = await cashierClient.requestJson<CashShiftMovementDTO>(
      '/api/shifts/cash-movement',
      {
        method: 'POST',
        json: {
          movementType: 'CASH_IN',
          amount: 50_000,
          reason: 'Penambahan uang koin kembalian',
        },
      },
    )
    assert.equal(cashInRes.status, 201)
    assert(cashInRes.body.ok)
    assert.equal(cashInRes.body.data.amount, 50_000)

    // Movement B: Cash Out (Rp 20.000 beli galon air)
    const cashOutRes = await cashierClient.requestJson<CashShiftMovementDTO>(
      '/api/shifts/cash-movement',
      {
        method: 'POST',
        json: {
          movementType: 'CASH_OUT',
          amount: 20_000,
          reason: 'Beli air galon untuk outlet',
        },
      },
    )
    assert.equal(cashOutRes.status, 201)
    assert(cashOutRes.body.ok)
    assert.equal(cashOutRes.body.data.amount, 20_000)

    // Invariant: Cash Out cannot exceed current cash drawer balance
    // Current drawer: 200k + 50k - 20k = 230k. Try withdrawing 500k:
    const excessiveCashOut = await cashierClient.requestJson<CashShiftMovementDTO>(
      '/api/shifts/cash-movement',
      {
        method: 'POST',
        json: {
          movementType: 'CASH_OUT',
          amount: 500_000,
          reason: 'Tarik berlebihan yang tidak sah',
        },
      },
    )
    assert.equal(excessiveCashOut.status, 400)
    assert(!excessiveCashOut.body.ok)
    assert.match(excessiveCashOut.body.error?.message ?? '', /melebihi saldo kas/i)

    // 11. Process Sales during shift
    // Sale 1: CASH (2x cup @ 18.000 = 36.000)
    const cashSale = await cashierClient.requestJson<SaleDetailDTO>('/api/sales', {
      method: 'POST',
      json: {
        items: [{ productId: product.id, qty: 2 }],
        discountAmount: 0,
        paymentMethod: 'CASH',
        paidAmount: 50_000,
        customerName: 'Pelanggan Tunai',
      },
    })
    assert.equal(cashSale.status, 201)
    assert(cashSale.body.ok)
    assert.equal(cashSale.body.data.shiftId, activeShift.id)

    // Sale 2: QRIS (1x cup @ 18.000 = 18.000)
    const qrisSale = await cashierClient.requestJson<SaleDetailDTO>('/api/sales', {
      method: 'POST',
      json: {
        items: [{ productId: product.id, qty: 1 }],
        discountAmount: 0,
        paymentMethod: 'QRIS',
        paidAmount: 18_000,
        customerName: 'Pelanggan Non-Tunai',
      },
    })
    assert.equal(qrisSale.status, 201)
    assert(qrisSale.body.ok)
    assert.equal(qrisSale.body.data.shiftId, activeShift.id)

    // 12. Check live X-Report via /api/shifts/current
    // Expected Cash: 200.000 (modal) + 50.000 (cash in) - 20.000 (cash out) + 36.000 (cash sale) = 266.000
    // QRIS sale (18.000) tracked in totalNonCashSales, does NOT inflate physical cash drawer!
    const liveStatus =
      await cashierClient.requestJson<CurrentShiftStatusDTO>('/api/shifts/current')
    assert.equal(liveStatus.status, 200)
    assert(liveStatus.body.ok)
    const current = liveStatus.body.data.shift
    assert(current !== null)
    assert.equal(current.openingCash, 200_000)
    assert.equal(current.totalCashIn, 50_000)
    assert.equal(current.totalCashOut, 20_000)
    assert.equal(current.totalCashSales, 36_000)
    assert.equal(current.totalNonCashSales, 18_000)
    assert.equal(current.transactionCount, 2)
    assert.equal(current.expectedCash, 266_000)
    assert.equal(current.movements.length, 2)

    // 13. Close Shift with Physical Cash Count
    // Cashier counts actual cash in drawer = Rp 265.000 (selisih minus Rp 1.000)
    const closeRes = await cashierClient.requestJson<CashShiftDetailDTO>(
      '/api/shifts/close',
      {
        method: 'POST',
        json: {
          actualCash: 265_000,
          notes: 'Selisih kurang Rp 1.000 karena pembulatan permen koin',
        },
      },
    )
    assert.equal(closeRes.status, 200)
    assert(closeRes.body.ok)
    const closed = closeRes.body.data
    assert.equal(closed.status, 'CLOSED')
    assert.equal(closed.closingCash, 265_000)
    assert.equal(closed.expectedCash, 266_000)
    assert.equal(closed.cashDifference, -1_000)
    assert.ok(closed.closedAt !== null)

    // 14. Invariant: After shift closed, cashier cannot checkout or close again
    const postCloseCheckout = await cashierClient.requestJson<SaleDetailDTO>(
      '/api/sales',
      {
        method: 'POST',
        json: {
          items: [{ productId: product.id, qty: 1 }],
          discountAmount: 0,
          paymentMethod: 'CASH',
          paidAmount: 20_000,
          customerName: null,
        },
      },
    )
    assert.equal(postCloseCheckout.status, 400)

    const postCloseAttempt = await cashierClient.requestJson<CashShiftDetailDTO>(
      '/api/shifts/close',
      {
        method: 'POST',
        json: { actualCash: 265_000, notes: null },
      },
    )
    assert.equal(postCloseAttempt.status, 400)

    // 15. RBAC & Reporting: Cashier can list their own shifts, Owner can inspect all
    const cashierShifts =
      await cashierClient.requestJson<PaginatedResult<CashShiftDetailDTO>>('/api/shifts')
    assert.equal(cashierShifts.status, 200)
    assert(cashierShifts.body.ok)
    assert.equal(cashierShifts.body.data.items.length, 1)
    assert.equal(cashierShifts.body.data.items[0]?.id, activeShift.id)

    const ownerShiftDetail = await ownerClient.requestJson<CashShiftDetailDTO>(
      `/api/shifts/${activeShift.id}`,
    )
    assert.equal(ownerShiftDetail.status, 200)
    assert(ownerShiftDetail.body.ok)
    assert.equal(ownerShiftDetail.body.data.cashierName, 'Budi Kasir')
    assert.equal(ownerShiftDetail.body.data.cashDifference, -1_000)
  })
})
