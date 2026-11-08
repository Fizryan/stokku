import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import type {
  CashShiftDetailDTO,
  CashShiftSummaryDTO,
  CurrentShiftStatusDTO,
  PaginatedResult,
  ProductDTO,
  SaleDetailDTO,
  SaleSummaryDTO,
  UserDTO,
} from '../src/shared/types.js'
import { createTestHarness, type TestHarness } from './helpers/test-app.js'

describe('Shifts Management & POS Edge-Cases (Extended Flow)', () => {
  let harness: TestHarness | null = null

  afterEach(() => {
    harness?.dispose()
    harness = null
  })

  it('validates POS payment methods, checkout edge cases, and cash shift discrepancy reconciliations', async () => {
    harness = createTestHarness()
    const client = harness.createClient()

    // 1. Initial setup: Owner
    await client.requestJson<{ user: UserDTO }>('/api/auth/setup', {
      method: 'POST',
      json: {
        fullName: 'Store Owner',
        username: 'owner',
        password: 'password123',
      },
    })

    // 2. Create products: 1 active, 1 inactive, 1 out of stock
    const prod1Res = await client.requestJson<ProductDTO>('/api/products', {
      method: 'POST',
      json: {
        sku: 'SNK-001',
        name: 'Keripik Singkong Balado',
        unit: 'BKS',
        costPrice: 5000,
        sellPrice: 10000,
        minStockAlert: 2,
      },
    })
    assert.equal(prod1Res.status, 201)
    assert(prod1Res.body.ok)
    const prod1Id = prod1Res.body.data.id

    const prodInactiveRes = await client.requestJson<ProductDTO>('/api/products', {
      method: 'POST',
      json: {
        sku: 'SNK-INACT',
        name: 'Produk Kadaluarsa',
        unit: 'BKS',
        costPrice: 2000,
        sellPrice: 4000,
      },
    })
    assert.equal(prodInactiveRes.status, 201)
    assert(prodInactiveRes.body.ok)
    const prodInactiveId = prodInactiveRes.body.data.id
    // Set inactive
    const setInactiveRes = await client.requestJson(`/api/products/${prodInactiveId}`, {
      method: 'PUT',
      json: {
        sku: 'SNK-INACT',
        barcode: null,
        name: 'Produk Kadaluarsa Nonaktif',
        unit: 'BKS',
        costPrice: 2000,
        sellPrice: 4000,
        categoryId: null,
        minStockQty: 0,
        isActive: false,
      },
    })
    assert.equal(setInactiveRes.status, 200)

    // Add stock to prod1 (10 units)
    const stockRes = await client.requestJson('/api/inventory/movements', {
      method: 'POST',
      json: {
        productId: prod1Id,
        movementType: 'ADJUSTMENT_OPNAME',
        actualStockQty: 10,
        note: 'Stok awal toko',
      },
    })
    assert.equal(stockRes.status, 201)

    // 3. Checkout without active shift must fail
    const checkoutNoShift = await client.requestJson('/api/sales', {
      method: 'POST',
      json: {
        paymentMethod: 'CASH',
        paidAmount: 20000,
        items: [{ productId: prod1Id, qty: 2 }],
      },
    })
    assert.equal(checkoutNoShift.status, 400)

    // 4. Open cash shift
    const openShiftRes = await client.requestJson<CashShiftDetailDTO>(
      '/api/shifts/open',
      {
        method: 'POST',
        json: {
          openingCash: 100000,
          notes: 'Uang modal pagi kasir',
        },
      },
    )
    assert.equal(openShiftRes.status, 201)
    assert(openShiftRes.body.ok)
    const shiftId = openShiftRes.body.data.id

    // Get current shift
    const activeShiftRes =
      await client.requestJson<CurrentShiftStatusDTO>('/api/shifts/current')
    assert.equal(activeShiftRes.status, 200)
    assert(activeShiftRes.body.ok)
    assert.equal(activeShiftRes.body.data.shift?.id, shiftId)

    // Opening second shift while one is active must fail
    const openAgain = await client.requestJson('/api/shifts/open', {
      method: 'POST',
      json: { openingCash: 50000 },
    })
    assert.equal(openAgain.status, 409)

    // 5. Checkout edge cases
    // a. Non-existent product
    const chkNotFound = await client.requestJson('/api/sales', {
      method: 'POST',
      json: {
        paymentMethod: 'CASH',
        paidAmount: 20000,
        items: [{ productId: 9999, qty: 1 }],
      },
    })
    assert.equal(chkNotFound.status, 404)

    // b. Inactive product
    const chkInactive = await client.requestJson('/api/sales', {
      method: 'POST',
      json: {
        paymentMethod: 'CASH',
        paidAmount: 20000,
        items: [{ productId: prodInactiveId, qty: 1 }],
      },
    })
    assert.equal(chkInactive.status, 400)

    // c. Insufficient stock (requested 50, available 10)
    const chkInsufficient = await client.requestJson('/api/sales', {
      method: 'POST',
      json: {
        paymentMethod: 'CASH',
        paidAmount: 500000,
        items: [{ productId: prod1Id, qty: 50 }],
      },
    })
    assert.equal(chkInsufficient.status, 409)

    // d. Diskon melebihi subtotal
    const chkExcessiveDiscount = await client.requestJson('/api/sales', {
      method: 'POST',
      json: {
        paymentMethod: 'CASH',
        paidAmount: 10000,
        discountAmount: 30000, // subtotal is 20,000
        items: [{ productId: prod1Id, qty: 2 }],
      },
    })
    assert.equal(chkExcessiveDiscount.status, 422)

    // e. Cash paidAmount kurang dari total tagihan
    const chkUnderpaid = await client.requestJson('/api/sales', {
      method: 'POST',
      json: {
        paymentMethod: 'CASH',
        paidAmount: 15000, // total tagihan 20,000
        items: [{ productId: prod1Id, qty: 2 }],
      },
    })
    assert.equal(chkUnderpaid.status, 422)

    // f. Non-CASH (QRIS) paidAmount must exactly match total amount
    const chkQrisMismatch = await client.requestJson('/api/sales', {
      method: 'POST',
      json: {
        paymentMethod: 'QRIS',
        paidAmount: 25000, // total is 20,000
        items: [{ productId: prod1Id, qty: 2 }],
      },
    })
    assert.equal(chkQrisMismatch.status, 422)

    // g. Successful QRIS checkout
    const chkQrisSuccess = await client.requestJson<SaleDetailDTO>('/api/sales', {
      method: 'POST',
      json: {
        paymentMethod: 'QRIS',
        paidAmount: 20000,
        items: [{ productId: prod1Id, qty: 2 }],
        notes: 'Pembayaran QRIS Statis',
      },
    })
    assert.equal(chkQrisSuccess.status, 201)
    assert(chkQrisSuccess.body.ok)
    assert.equal(chkQrisSuccess.body.data.paymentMethod, 'QRIS')
    const saleId = chkQrisSuccess.body.data.id

    // 6. Sale queries & details
    const saleDetail = await client.requestJson<SaleDetailDTO>(`/api/sales/${saleId}`)
    assert.equal(saleDetail.status, 200)
    assert(saleDetail.body.ok)
    assert.equal(saleDetail.body.data.id, saleId)

    const saleNotFound = await client.requestJson<SaleDetailDTO>('/api/sales/9999')
    assert.equal(saleNotFound.status, 404)

    const salesList = await client.requestJson<PaginatedResult<SaleSummaryDTO>>(
      '/api/sales?page=1&pageSize=10',
    )
    assert.equal(salesList.status, 200)
    assert(salesList.body.ok)
    assert(salesList.body.data.items.length >= 1)

    // Export Sales CSV
    const salesCsv = await client.requestRaw('/api/sales/export.csv')
    assert.equal(salesCsv.status, 200)
    const csvContent = await salesCsv.text()
    assert(csvContent.includes(chkQrisSuccess.body.data.invoiceNumber))

    // 7. Shift detail & Query
    const shiftDetailRes = await client.requestJson<CashShiftDetailDTO>(
      `/api/shifts/${shiftId}`,
    )
    assert.equal(shiftDetailRes.status, 200)
    assert(shiftDetailRes.body.ok)
    assert.equal(shiftDetailRes.body.data.id, shiftId)

    const shiftDetailNotFound =
      await client.requestJson<CashShiftDetailDTO>('/api/shifts/9999')
    assert.equal(shiftDetailNotFound.status, 404)

    const shiftsListRes = await client.requestJson<PaginatedResult<CashShiftSummaryDTO>>(
      '/api/shifts?status=OPEN&page=1&pageSize=10',
    )
    assert.equal(shiftsListRes.status, 200)

    // 8. Close shift with discrepancy (expected cash is 100,000 because sale was QRIS, but actual entered 95,000)
    const closeShiftRes = await client.requestJson<CashShiftDetailDTO>(
      '/api/shifts/close',
      {
        method: 'POST',
        json: {
          actualCash: 95000,
          notes: 'Selisih minus 5000 rupiah untuk kembalian receh',
        },
      },
    )
    assert.equal(closeShiftRes.status, 200)
    assert(closeShiftRes.body.ok)
    assert.equal(closeShiftRes.body.data.cashDifference, -5000)
    assert.equal(closeShiftRes.body.data.status, 'CLOSED')

    // Closing already closed shift must fail
    const closeAgain = await client.requestJson('/api/shifts/close', {
      method: 'POST',
      json: { actualCash: 100000 },
    })
    assert.equal(closeAgain.status, 400)
  })
})
