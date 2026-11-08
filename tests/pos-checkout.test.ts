import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import type {
  DashboardMetricsDTO,
  ProductDTO,
  PurchaseDetailDTO,
  SaleDetailDTO,
  SupplierDTO,
  UserDTO,
} from '../src/shared/types.js'
import { createTestHarness, type TestHarness } from './helpers/test-app.js'

describe('POS Checkout, Historical Snapshot & Void Reversal', () => {
  let harness: TestHarness | null = null

  afterEach(() => {
    harness?.dispose()
    harness = null
  })

  it('processes atomic multi-item checkout, preserves historical price/HPP snapshots, exports CSV, and restores stock on Owner void', async () => {
    harness = createTestHarness()
    const owner = harness.createClient()

    await owner.requestJson<{ user: UserDTO }>('/api/auth/setup', {
      method: 'POST',
      json: {
        fullName: 'Owner Toko',
        username: 'owner',
        password: 'password123',
      },
    })

    const p1Res = await owner.requestJson<ProductDTO>('/api/products', {
      method: 'POST',
      json: {
        sku: 'SNACK-01',
        barcode: '8990001',
        name: 'Keripik Singkong Balado',
        categoryId: null,
        unit: 'pcs',
        costPrice: 8_000,
        sellPrice: 12_000,
        minStockQty: 5,
        initialStock: 20,
      },
    })
    assert(p1Res.body.ok)

    const p2Res = await owner.requestJson<ProductDTO>('/api/products', {
      method: 'POST',
      json: {
        sku: 'SNACK-02',
        barcode: '8990002',
        name: 'Kacang Panggang Madu',
        categoryId: null,
        unit: 'pcs',
        costPrice: 15_000,
        sellPrice: 22_000,
        minStockQty: 5,
        initialStock: 10,
      },
    })
    assert(p2Res.body.ok)

    const prod1 = p1Res.body.data
    const prod2 = p2Res.body.data

    const supplierRes = await owner.requestJson<SupplierDTO>('/api/suppliers', {
      method: 'POST',
      json: { name: 'Supplier Batch FEFO' },
    })
    assert(supplierRes.body.ok)
    const earlyExpiry = new Date()
    earlyExpiry.setDate(earlyExpiry.getDate() + 7)
    const lateExpiry = new Date()
    lateExpiry.setDate(lateExpiry.getDate() + 21)
    const purchaseRes = await owner.requestJson<PurchaseDetailDTO>('/api/purchases', {
      method: 'POST',
      json: {
        invoiceNumber: 'FEFO-TEST-001',
        supplierId: supplierRes.body.data.id,
        paymentStatus: 'PAID',
        items: [
          {
            productId: prod1.id,
            qty: 2,
            unitCost: 8_000,
            expiryDate: lateExpiry.toISOString().slice(0, 10),
          },
          {
            productId: prod1.id,
            qty: 2,
            unitCost: 8_000,
            expiryDate: earlyExpiry.toISOString().slice(0, 10),
          },
        ],
      },
    })
    assert.equal(purchaseRes.status, 201)
    const expiredDate = new Date()
    expiredDate.setDate(expiredDate.getDate() - 1)
    harness.db
      .prepare(`
        UPDATE stock_batches
        SET expiry_date = ?
        WHERE product_id = ? AND source_type = 'INITIAL'
      `)
      .run(expiredDate.toISOString().slice(0, 10), prod1.id)

    const openShiftRes = await owner.requestJson('/api/shifts/open', {
      method: 'POST',
      json: { openingCash: 150_000, notes: 'Shift pagi owner' },
    })
    assert.equal(openShiftRes.status, 201)

    // Reject underpaid checkout
    const underpaidRes = await owner.requestJson<SaleDetailDTO>('/api/sales', {
      method: 'POST',
      json: {
        items: [{ productId: prod1.id, qty: 2 }],
        discountAmount: 0,
        paymentMethod: 'CASH',
        paidAmount: 20_000, // Subtotal is 24.000
        customerName: null,
      },
    })
    assert.equal(underpaidRes.status, 422)

    const expiredStockCheckout = await owner.requestJson<SaleDetailDTO>('/api/sales', {
      method: 'POST',
      json: {
        items: [{ productId: prod1.id, qty: 5 }],
        discountAmount: 0,
        paymentMethod: 'CASH',
        paidAmount: 60_000,
      },
    })
    assert.equal(expiredStockCheckout.status, 409)
    assert.equal(expiredStockCheckout.body.ok, false)
    if (expiredStockCheckout.body.ok) {
      throw new Error('Checkout with expired stock unexpectedly succeeded.')
    }
    assert.match(expiredStockCheckout.body.error.message, /belum kedaluwarsa/i)

    // Valid checkout:
    // 3x SNACK-01 (3 * 12.000 = 36.000, cost = 24.000)
    // 2x SNACK-02 (2 * 22.000 = 44.000, cost = 30.000)
    // Subtotal = 80.000, Discount = 5.000 -> Total = 75.000
    // Gross profit = (36.000 - 24.000) + (44.000 - 30.000) - 5.000 = 12.000 + 14.000 - 5.000 = 21.000
    const saleRes = await owner.requestJson<SaleDetailDTO>('/api/sales', {
      method: 'POST',
      json: {
        items: [
          { productId: prod1.id, qty: 3 },
          { productId: prod2.id, qty: 2 },
        ],
        discountAmount: 5_000,
        paymentMethod: 'CASH',
        paidAmount: 100_000,
        customerName: 'Pelanggan Setia',
      },
    })
    assert.equal(saleRes.status, 201)
    assert(saleRes.body.ok)
    const sale = saleRes.body.data
    assert.match(sale.invoiceNumber, /^INV-\d{8}-0001$/)
    assert.equal(sale.subtotalAmount, 80_000)
    assert.equal(sale.discountAmount, 5_000)
    assert.equal(sale.totalAmount, 75_000)
    assert.equal(sale.changeAmount, 25_000)
    assert.equal(sale.grossProfitAmount, 21_000)

    // Verify stocks were atomically deducted (24 -> 21 and 10 -> 8)
    const lookup1 = await owner.requestJson<ProductDTO>(
      '/api/products/lookup?code=8990001',
    )
    assert(lookup1.body.ok)
    assert.equal(lookup1.body.data.stockQty, 21)
    const batchRowsAfterSale = harness.db
      .prepare(`
        SELECT expiry_date, qty_remaining
        FROM stock_batches
        WHERE product_id = ? AND expiry_date IS NOT NULL
        ORDER BY expiry_date ASC
      `)
      .all(prod1.id) as Array<{ expiry_date: string; qty_remaining: number }>
    assert.deepEqual(
      batchRowsAfterSale.map((batch) => batch.qty_remaining),
      [20, 0, 1],
    )

    // Mutate master product prices AFTER the sale and verify historical sale snapshot is untouched!
    const updateProdRes = await owner.requestJson<ProductDTO>(
      `/api/products/${prod1.id}`,
      {
        method: 'PUT',
        json: {
          sku: prod1.sku,
          barcode: prod1.barcode,
          name: 'Keripik Singkong Balado Kemasan Baru',
          categoryId: null,
          unit: 'pcs',
          costPrice: 11_000,
          sellPrice: 19_000,
          minStockQty: 5,
          isActive: true,
        },
      },
    )
    assert.equal(updateProdRes.status, 200)

    const historicalSale = await owner.requestJson<SaleDetailDTO>(`/api/sales/${sale.id}`)
    assert(historicalSale.body.ok)
    assert.equal(historicalSale.body.data.grossProfitAmount, 21_000)
    const item1Snapshot = historicalSale.body.data.items.find(
      (i) => i.productId === prod1.id,
    )
    assert.equal(item1Snapshot?.productNameSnapshot, 'Keripik Singkong Balado')
    assert.equal(item1Snapshot?.costPriceAtSale, 8_000)
    assert.equal(item1Snapshot?.sellPriceAtSale, 12_000)

    // Verify Dashboard KPIs reflect the completed sale
    const dashRes = await owner.requestJson<DashboardMetricsDTO>('/api/dashboard?days=14')
    assert.equal(dashRes.status, 200)
    assert(dashRes.body.ok)
    assert.equal(dashRes.body.data.todayRevenueAmount, 75_000)
    assert.equal(dashRes.body.data.todayGrossProfitAmount, 21_000)

    // Verify CSV export works and streams UTF-8 BOM + invoice row
    const csvRes = await owner.requestRaw('/api/sales/export.csv')
    assert.equal(csvRes.status, 200)
    const csvText = await csvRes.text()
    assert(csvText.includes(sale.invoiceNumber))
    assert(csvText.includes('Pelanggan Setia'))

    // Void the sale and verify stock restoration + double-void prevention
    const voidRes = await owner.requestJson<SaleDetailDTO>(`/api/sales/${sale.id}/void`, {
      method: 'POST',
      json: { reason: 'Pelanggan salah pilih varian produk' },
    })
    assert.equal(voidRes.status, 200)
    assert(voidRes.body.ok)
    assert.equal(voidRes.body.data.status, 'VOIDED')
    assert.equal(voidRes.body.data.grossProfitAmount, 0)

    const lookupAfterVoid1 = await owner.requestJson<ProductDTO>(
      '/api/products/lookup?code=8990001',
    )
    const lookupAfterVoid2 = await owner.requestJson<ProductDTO>(
      '/api/products/lookup?code=8990002',
    )
    assert(lookupAfterVoid1.body.ok)
    assert(lookupAfterVoid2.body.ok)
    assert.equal(lookupAfterVoid1.body.data.stockQty, 24)
    assert.equal(lookupAfterVoid2.body.data.stockQty, 10)
    const batchRowsAfterVoid = harness.db
      .prepare(`
        SELECT qty_remaining
        FROM stock_batches
        WHERE product_id = ? AND expiry_date IS NOT NULL
        ORDER BY expiry_date ASC
      `)
      .all(prod1.id) as Array<{ qty_remaining: number }>
    assert.deepEqual(
      batchRowsAfterVoid.map((batch) => batch.qty_remaining),
      [20, 2, 2],
    )

    // Double void must be rejected with 409 Conflict
    const doubleVoidRes = await owner.requestJson<SaleDetailDTO>(
      `/api/sales/${sale.id}/void`,
      {
        method: 'POST',
        json: { reason: 'Percobaan void ulang kedua kali' },
      },
    )
    assert.equal(doubleVoidRes.status, 409)
  })
})
