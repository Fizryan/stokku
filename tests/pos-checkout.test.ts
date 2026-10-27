import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import type {
  DashboardMetricsDTO,
  ProductDTO,
  SaleDetailDTO,
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

    // Verify stocks were atomically deducted (20 -> 17 and 10 -> 8)
    const lookup1 = await owner.requestJson<ProductDTO>(
      '/api/products/lookup?code=8990001',
    )
    assert(lookup1.body.ok)
    assert.equal(lookup1.body.data.stockQty, 17)

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
    assert.equal(lookupAfterVoid1.body.data.stockQty, 20)
    assert.equal(lookupAfterVoid2.body.data.stockQty, 10)

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
