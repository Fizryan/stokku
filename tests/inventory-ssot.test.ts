import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import type {
  CategoryDTO,
  PaginatedResult,
  ProductDTO,
  StockMovementDTO,
  UserDTO,
} from '../src/shared/types.js'
import { createTestHarness, type TestHarness } from './helpers/test-app.js'

describe('Inventory SSOT & Immutable Stock Ledger', () => {
  let harness: TestHarness | null = null

  afterEach(() => {
    harness?.dispose()
    harness = null
  })

  it('maintains strict SSOT ledger invariants across INITIAL, IN_PURCHASE (weighted average HPP), ADJUSTMENT_OPNAME, and OUT_DAMAGED', async () => {
    harness = createTestHarness()
    const ownerClient = harness.createClient()

    const setupRes = await ownerClient.requestJson<{ user: UserDTO }>('/api/auth/setup', {
      method: 'POST',
      json: {
        fullName: 'Owner Utama',
        username: 'owner',
        password: 'password123',
      },
    })
    assert.equal(setupRes.status, 201)
    assert.equal(setupRes.body.ok, true)

    const catRes = await ownerClient.requestJson<CategoryDTO>('/api/categories', {
      method: 'POST',
      json: { name: 'Minuman Kemasan', description: 'Minuman botol & kaleng' },
    })
    assert.equal(catRes.status, 201)
    assert(catRes.body.ok)

    // 1. Create product with initialStock = 10 @ costPrice Rp 10.000
    const prodRes = await ownerClient.requestJson<ProductDTO>('/api/products', {
      method: 'POST',
      json: {
        sku: ' drink-001 ',
        barcode: '8991002003001',
        name: 'Kopi Susu Dingin 250ml',
        categoryId: catRes.body.data.id,
        unit: 'botol',
        costPrice: 10_000,
        sellPrice: 15_000,
        minStockQty: 5,
        initialStock: 10,
      },
    })
    assert.equal(prodRes.status, 201)
    assert(prodRes.body.ok)
    const product = prodRes.body.data
    assert.equal(product.sku, 'DRINK-001')
    assert.equal(product.stockQty, 10)
    assert.equal(product.costPrice, 10_000)

    // 2. IN_PURCHASE: +10 botol @ Rp 12.000 -> Weighted average HPP = (10*10.000 + 10*12.000) / 20 = Rp 11.000
    const restockRes = await ownerClient.requestJson<StockMovementDTO>(
      '/api/inventory/movements',
      {
        method: 'POST',
        json: {
          productId: product.id,
          movementType: 'IN_PURCHASE',
          quantity: 10,
          unitCost: 12_000,
          note: 'PO Supplier Batch #2',
        },
      },
    )
    assert.equal(restockRes.status, 201)
    assert(restockRes.body.ok)
    assert.equal(restockRes.body.data.qtyBefore, 10)
    assert.equal(restockRes.body.data.qtyChange, 10)
    assert.equal(restockRes.body.data.qtyAfter, 20)
    assert.equal(restockRes.body.data.unitCostSnapshot, 12_000)

    const afterRestock = await ownerClient.requestJson<PaginatedResult<ProductDTO>>(
      '/api/products?search=DRINK-001',
    )
    assert(afterRestock.body.ok)
    assert.equal(afterRestock.body.data.items[0]?.stockQty, 20)
    assert.equal(afterRestock.body.data.items[0]?.costPrice, 11_000)

    // 3. ADJUSTMENT_OPNAME: physical count = 18 -> qtyChange = -2
    const opnameRes = await ownerClient.requestJson<StockMovementDTO>(
      '/api/inventory/movements',
      {
        method: 'POST',
        json: {
          productId: product.id,
          movementType: 'ADJUSTMENT_OPNAME',
          actualStockQty: 18,
          note: 'Selisih hitung fisik rak pendingin',
        },
      },
    )
    assert.equal(opnameRes.status, 201)
    assert(opnameRes.body.ok)
    assert.equal(opnameRes.body.data.qtyBefore, 20)
    assert.equal(opnameRes.body.data.qtyChange, -2)
    assert.equal(opnameRes.body.data.qtyAfter, 18)

    // 4. OUT_DAMAGED: -3 botol -> stock becomes 15
    const damagedRes = await ownerClient.requestJson<StockMovementDTO>(
      '/api/inventory/movements',
      {
        method: 'POST',
        json: {
          productId: product.id,
          movementType: 'OUT_DAMAGED',
          quantity: 3,
          note: 'Kemasan penyok saat pemindahan gudang',
        },
      },
    )
    assert.equal(damagedRes.status, 201)
    assert(damagedRes.body.ok)
    assert.equal(damagedRes.body.data.qtyAfter, 15)

    // 5. Reject negative stock attempt (OUT_DAMAGED 20 > 15 available)
    const overDeductRes = await ownerClient.requestJson<StockMovementDTO>(
      '/api/inventory/movements',
      {
        method: 'POST',
        json: {
          productId: product.id,
          movementType: 'OUT_DAMAGED',
          quantity: 20,
          note: 'Percobaan melebihi stok tersedia',
        },
      },
    )
    assert.equal(overDeductRes.status, 409)
    assert.equal(overDeductRes.body.ok, false)
    if (!overDeductRes.body.ok) {
      assert.equal(overDeductRes.body.error.code, 'INSUFFICIENT_STOCK')
    }

    // 6. Verify ledger sum strictly matches current products.stock_qty (SSOT reconciliation)
    const ledgerRes = await ownerClient.requestJson<PaginatedResult<StockMovementDTO>>(
      `/api/inventory/movements?productId=${product.id}&pageSize=50`,
    )
    assert.equal(ledgerRes.status, 200)
    assert(ledgerRes.body.ok)
    assert.equal(ledgerRes.body.data.items.length, 4)

    const chronological = [...ledgerRes.body.data.items].reverse()
    let runningBalance = 0
    for (const entry of chronological) {
      assert.equal(entry.qtyBefore, runningBalance)
      assert.equal(entry.qtyBefore + entry.qtyChange, entry.qtyAfter)
      runningBalance = entry.qtyAfter
    }
    assert.equal(runningBalance, 15)

    const dbRow = harness.db
      .prepare('SELECT stock_qty FROM products WHERE id = ?')
      .get(product.id) as { stock_qty: number }
    assert.equal(dbRow.stock_qty, runningBalance)
  })
})
