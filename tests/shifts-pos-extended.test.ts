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
        paidAmount: 15000, // total tagihan 22.200 (20.000 + pajak 11%)
        items: [{ productId: prod1Id, qty: 2 }],
      },
    })
    assert.equal(chkUnderpaid.status, 422)

    // f. Non-CASH (QRIS) paidAmount must exactly match total amount
    const chkQrisMismatch = await client.requestJson('/api/sales', {
      method: 'POST',
      json: {
        paymentMethod: 'QRIS',
        paidAmount: 25000, // total is 22.200 (20.000 + pajak 11%)
        items: [{ productId: prod1Id, qty: 2 }],
      },
    })
    assert.equal(chkQrisMismatch.status, 422)

    // g. Successful QRIS checkout (subtotal 20.000 + pajak 11% = 22.200)
    const chkQrisSuccess = await client.requestJson<SaleDetailDTO>('/api/sales', {
      method: 'POST',
      json: {
        paymentMethod: 'QRIS',
        paidAmount: 22_200,
        items: [{ productId: prod1Id, qty: 2 }],
        notes: 'Pembayaran QRIS Statis',
      },
    })
    assert.equal(chkQrisSuccess.status, 201)
    assert(chkQrisSuccess.body.ok)
    assert.equal(chkQrisSuccess.body.data.paymentMethod, 'QRIS')
    assert.equal(chkQrisSuccess.body.data.taxAmount, 2_200)
    assert.equal(chkQrisSuccess.body.data.totalAmount, 22_200)
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

  it('close shift reconciles cash against tax-inclusive sale totals (expectedCash, cash/non-cash breakdown)', async () => {
    harness = createTestHarness()
    const owner = harness.createClient()

    // 1. Initial setup: Owner
    const setupRes = await owner.requestJson<{ user: UserDTO }>('/api/auth/setup', {
      method: 'POST',
      json: {
        fullName: 'Owner Toko',
        username: 'owner',
        password: 'password123',
      },
    })
    assert.equal(setupRes.status, 201)
    assert(setupRes.body.ok)

    // 2. Product: sell 10.000 -> every unit adds 1.100 tax to the bill
    const prodRes = await owner.requestJson<ProductDTO>('/api/products', {
      method: 'POST',
      json: {
        sku: 'TAX-SHIFT-01',
        name: 'Produk Uji Pajak Shift',
        unit: 'pcs',
        costPrice: 5_000,
        sellPrice: 10_000,
        minStockQty: 0,
        initialStock: 10,
      },
    })
    assert.equal(prodRes.status, 201)
    assert(prodRes.body.ok)
    const productId = prodRes.body.data.id

    // 3. Open shift with 100.000 opening cash
    const openShiftRes = await owner.requestJson<CashShiftDetailDTO>('/api/shifts/open', {
      method: 'POST',
      json: { openingCash: 100_000 },
    })
    assert.equal(openShiftRes.status, 201)
    assert(openShiftRes.body.ok)
    const shiftId = openShiftRes.body.data.id

    // 4. CASH sale: 10.000 + pajak 1.100 = 11.100 (overpay -> kembalian 8.900)
    const cashSaleRes = await owner.requestJson<SaleDetailDTO>('/api/sales', {
      method: 'POST',
      json: {
        items: [{ productId, qty: 1 }],
        paymentMethod: 'CASH',
        paidAmount: 20_000,
      },
    })
    assert.equal(cashSaleRes.status, 201)
    assert(cashSaleRes.body.ok)
    assert.equal(cashSaleRes.body.data.taxAmount, 1_100)
    assert.equal(cashSaleRes.body.data.totalAmount, 11_100)
    assert.equal(cashSaleRes.body.data.changeAmount, 8_900)

    // 5. QRIS sale: 20.000 + pajak 2.200 = 22.200 (exact pay)
    const qrisSaleRes = await owner.requestJson<SaleDetailDTO>('/api/sales', {
      method: 'POST',
      json: {
        items: [{ productId, qty: 2 }],
        paymentMethod: 'QRIS',
        paidAmount: 22_200,
      },
    })
    assert.equal(qrisSaleRes.status, 201)
    assert(qrisSaleRes.body.ok)
    assert.equal(qrisSaleRes.body.data.taxAmount, 2_200)
    assert.equal(qrisSaleRes.body.data.totalAmount, 22_200)

    // 6. Shift totals reflect TAX-INCLUSIVE totals
    const shiftBeforeClose = await owner.requestJson<CashShiftDetailDTO>(
      `/api/shifts/${shiftId}`,
    )
    assert.equal(shiftBeforeClose.status, 200)
    assert(shiftBeforeClose.body.ok)
    assert.equal(shiftBeforeClose.body.data.totalCashSales, 11_100)
    assert.equal(shiftBeforeClose.body.data.totalNonCashSales, 22_200)
    assert.equal(shiftBeforeClose.body.data.transactionCount, 2)
    // expectedCash = 100.000 opening + 11.100 tax-inclusive cash sales
    assert.equal(shiftBeforeClose.body.data.expectedCash, 111_100)

    // 7. Close shift with exact cash -> cashDifference 0
    const closeShiftRes = await owner.requestJson<CashShiftDetailDTO>(
      '/api/shifts/close',
      {
        method: 'POST',
        json: {
          actualCash: 111_100,
          notes: 'Kas laci pas sesuai harapan',
        },
      },
    )
    assert.equal(closeShiftRes.status, 200)
    assert(closeShiftRes.body.ok)
    assert.equal(closeShiftRes.body.data.status, 'CLOSED')
    assert.equal(closeShiftRes.body.data.expectedCash, 111_100)
    assert.equal(closeShiftRes.body.data.closingCash, 111_100)
    assert.equal(closeShiftRes.body.data.cashDifference, 0)
    assert.equal(closeShiftRes.body.data.totalCashSales, 11_100)
    assert.equal(closeShiftRes.body.data.totalNonCashSales, 22_200)

    // 8. Voided tax-inclusive sale must NOT inflate shift cash expectations
    //    (open a fresh shift, sell, void, then verify totals drop back)
    const shift2Res = await owner.requestJson<CashShiftDetailDTO>('/api/shifts/open', {
      method: 'POST',
      json: { openingCash: 50_000 },
    })
    assert.equal(shift2Res.status, 201)
    assert(shift2Res.body.ok)
    const shift2Id = shift2Res.body.data.id

    const sale2Res = await owner.requestJson<SaleDetailDTO>('/api/sales', {
      method: 'POST',
      json: {
        items: [{ productId, qty: 1 }],
        paymentMethod: 'CASH',
        paidAmount: 11_100,
      },
    })
    assert.equal(sale2Res.status, 201)
    assert(sale2Res.body.ok)
    const sale2 = sale2Res.body.data

    const voidRes = await owner.requestJson<SaleDetailDTO>(
      `/api/sales/${sale2.id}/void`,
      {
        method: 'POST',
        json: { reason: 'Batal, uji pajak tidak masuk kas shift' },
      },
    )
    assert.equal(voidRes.status, 200)

    const shift2AfterVoid = await owner.requestJson<CashShiftDetailDTO>(
      `/api/shifts/${shift2Id}`,
    )
    assert(shift2AfterVoid.body.ok)
    assert.equal(shift2AfterVoid.body.data.totalCashSales, 0)
    assert.equal(shift2AfterVoid.body.data.totalNonCashSales, 0)
    assert.equal(shift2AfterVoid.body.data.expectedCash, 50_000)

    const closeShift2Res = await owner.requestJson<CashShiftDetailDTO>(
      '/api/shifts/close',
      {
        method: 'POST',
        json: { actualCash: 50_000 },
      },
    )
    assert.equal(closeShift2Res.status, 200)
    assert(closeShift2Res.body.ok)
    assert.equal(closeShift2Res.body.data.cashDifference, 0)
  })
})
