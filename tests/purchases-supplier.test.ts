import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import type {
  PaginatedResult,
  ProductDTO,
  PurchaseDetailDTO,
  PurchaseSummaryDTO,
  StockMovementDTO,
  SupplierDTO,
  UserDTO,
} from '../src/shared/types.js'
import { createTestHarness, type TestHarness } from './helpers/test-app.js'

describe('Supplier & Purchase Invoicing Engine (Purchasing & SSOT Weighted-Average HPP)', () => {
  let harness: TestHarness | null = null

  afterEach(() => {
    harness?.dispose()
    harness = null
  })

  it('manages suppliers, processes multi-item purchase invoices with weighted-average cost, and tracks payment settlement', async () => {
    harness = createTestHarness()
    const ownerClient = harness.createClient()
    const warehouseClient = harness.createClient()
    const cashierClient = harness.createClient()

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

    // 2. Create Warehouse and Cashier accounts
    const whUserRes = await ownerClient.requestJson<UserDTO>('/api/users', {
      method: 'POST',
      json: {
        username: 'gudang_edi',
        fullName: 'Edi Gudang',
        role: 'WAREHOUSE',
        password: 'password123',
      },
    })
    assert.equal(whUserRes.status, 201)
    assert(whUserRes.body.ok)

    const cashierUserRes = await ownerClient.requestJson<UserDTO>('/api/users', {
      method: 'POST',
      json: {
        username: 'kasir_dina',
        fullName: 'Dina Kasir',
        role: 'CASHIER',
        password: 'password123',
      },
    })
    assert.equal(cashierUserRes.status, 201)
    assert(cashierUserRes.body.ok)

    // Login Warehouse & Cashier
    const whLogin = await warehouseClient.requestJson<{ user: UserDTO }>(
      '/api/auth/login',
      {
        method: 'POST',
        json: { username: 'gudang_edi', password: 'password123' },
      },
    )
    assert.equal(whLogin.status, 200)
    assert(whLogin.body.ok)

    const cashierLogin = await cashierClient.requestJson<{ user: UserDTO }>(
      '/api/auth/login',
      {
        method: 'POST',
        json: { username: 'kasir_dina', password: 'password123' },
      },
    )
    assert.equal(cashierLogin.status, 200)
    assert(cashierLogin.body.ok)

    // 3. RBAC: Cashier cannot access suppliers or purchases
    const cashierSupplierAttempt = await cashierClient.requestJson('/api/suppliers')
    assert.equal(cashierSupplierAttempt.status, 403)

    const cashierPurchaseAttempt = await cashierClient.requestJson('/api/purchases')
    assert.equal(cashierPurchaseAttempt.status, 403)

    // 4. Warehouse creates Supplier
    const createSupplierRes = await warehouseClient.requestJson<SupplierDTO>(
      '/api/suppliers',
      {
        method: 'POST',
        json: {
          name: 'PT Sumber Pangan Sejahtera',
          contactPerson: 'Pak Harto (Sales)',
          phone: '081234567890',
          address: 'Kawasan Industri Pulogadung Blok B No. 4',
          notes: 'Pemasok utama sembako dan makanan ringan',
        },
      },
    )
    assert.equal(createSupplierRes.status, 201)
    assert(createSupplierRes.body.ok)
    const supplier = createSupplierRes.body.data
    assert.equal(supplier.name, 'PT Sumber Pangan Sejahtera')
    assert.equal(supplier.isActive, true)

    // Invariant: Duplicate supplier name is rejected (409 Conflict)
    const dupSupplierRes = await warehouseClient.requestJson<SupplierDTO>(
      '/api/suppliers',
      {
        method: 'POST',
        json: {
          name: 'pt sumber pangan sejahtera',
          contactPerson: null,
          phone: null,
          address: null,
          notes: null,
        },
      },
    )
    assert.equal(dupSupplierRes.status, 409)

    // 5. Create initial products
    // Product A: 10 pcs @ HPP 10.000, sell 15.000
    const prodARes = await ownerClient.requestJson<ProductDTO>('/api/products', {
      method: 'POST',
      json: {
        sku: 'MIE-01',
        name: 'Mie Instan Goreng Spesial',
        unit: 'pcs',
        costPrice: 10_000,
        sellPrice: 15_000,
        minStockQty: 5,
        initialStock: 10,
      },
    })
    assert.equal(prodARes.status, 201)
    assert(prodARes.body.ok)
    const prodA = prodARes.body.data
    assert.equal(prodA.stockQty, 10)
    assert.equal(prodA.costPrice, 10_000)

    // Product B: 0 pcs @ HPP 20.000, sell 30.000
    const prodBRes = await ownerClient.requestJson<ProductDTO>('/api/products', {
      method: 'POST',
      json: {
        sku: 'MINYAK-01',
        name: 'Minyak Goreng Sawit 1L',
        unit: 'botol',
        costPrice: 20_000,
        sellPrice: 30_000,
        minStockQty: 5,
        initialStock: 0,
      },
    })
    assert.equal(prodBRes.status, 201)
    assert(prodBRes.body.ok)
    const prodB = prodBRes.body.data

    // 6. Record Multi-Item Purchase Invoice (Faktur Pembelian)
    // Product A: restock 20 pcs @ 13.000
    // Weighted Average HPP Calculation for Product A:
    // Old stock = 10 pcs @ 10.000 = 100.000
    // Incoming = 20 pcs @ 13.000 = 260.000
    // Total value = 360.000, Total qty = 30 pcs -> New HPP = 360.000 / 30 = 12.000
    //
    // Product B: restock 15 pcs @ 24.000
    // Total Invoice = (20 * 13.000) + (15 * 24.000) = 260.000 + 360.000 = 620.000
    const invoiceNumber = 'FAKTUR-SPS-20261028-001'
    const purchaseRes = await warehouseClient.requestJson<PurchaseDetailDTO>(
      '/api/purchases',
      {
        method: 'POST',
        json: {
          invoiceNumber,
          supplierId: supplier.id,
          paymentStatus: 'UNPAID', // Tempo
          dueDate: '2026-11-28',
          notes: 'Pengiriman via truk logistik armada 2',
          items: [
            { productId: prodA.id, qty: 20, unitCost: 13_000 },
            { productId: prodB.id, qty: 15, unitCost: 24_000 },
          ],
        },
      },
    )
    assert.equal(purchaseRes.status, 201)
    assert(purchaseRes.body.ok)
    const purchase = purchaseRes.body.data

    assert.equal(purchase.invoiceNumber, invoiceNumber)
    assert.equal(purchase.supplierId, supplier.id)
    assert.equal(purchase.supplierName, 'PT Sumber Pangan Sejahtera')
    assert.equal(purchase.subtotalAmount, 620_000)
    assert.equal(purchase.paymentStatus, 'UNPAID')
    assert.equal(purchase.dueDate, '2026-11-28')
    assert.equal(purchase.itemCount, 2)
    assert.equal(purchase.totalQty, 35)
    assert.equal(purchase.items.length, 2)

    // 7. Verify Product A Stock and Weighted-Average HPP
    const updatedProdA = await ownerClient.requestJson<ProductDTO>(
      `/api/products/${prodA.id}`,
    )
    assert.equal(updatedProdA.status, 200)
    assert(updatedProdA.body.ok)
    assert.equal(updatedProdA.body.data.stockQty, 30) // 10 + 20
    assert.equal(updatedProdA.body.data.costPrice, 12_000) // Weighted Average HPP!

    // Verify Product B Stock and HPP
    const updatedProdB = await ownerClient.requestJson<ProductDTO>(
      `/api/products/${prodB.id}`,
    )
    assert.equal(updatedProdB.status, 200)
    assert(updatedProdB.body.ok)
    assert.equal(updatedProdB.body.data.stockQty, 15) // 0 + 15
    assert.equal(updatedProdB.body.data.costPrice, 24_000) // Updated to invoice cost

    // 8. Verify SSOT Stock Movement Ledger entries
    const ledgerRes = await warehouseClient.requestJson<
      PaginatedResult<StockMovementDTO>
    >(`/api/inventory/movements?productId=${prodA.id}`)
    assert.equal(ledgerRes.status, 200)
    assert(ledgerRes.body.ok)
    const movements = ledgerRes.body.data.items
    const purchaseMovement = movements.find((m) => m.referenceId === purchase.id)
    assert(purchaseMovement !== undefined)
    assert.equal(purchaseMovement.movementType, 'IN_PURCHASE')
    assert.equal(purchaseMovement.qtyBefore, 10)
    assert.equal(purchaseMovement.qtyChange, 20)
    assert.equal(purchaseMovement.qtyAfter, 30)
    assert.equal(purchaseMovement.unitCostSnapshot, 13_000)

    // 9. Invariant: Duplicate invoice number is rejected (409 Conflict)
    const dupInvoiceRes = await warehouseClient.requestJson<PurchaseDetailDTO>(
      '/api/purchases',
      {
        method: 'POST',
        json: {
          invoiceNumber,
          supplierId: supplier.id,
          paymentStatus: 'PAID',
          dueDate: null,
          notes: null,
          items: [{ productId: prodA.id, qty: 5, unitCost: 10_000 }],
        },
      },
    )
    assert.equal(dupInvoiceRes.status, 409)

    // 10. Settle Payment Status (Mark Tempo as PAID)
    const settleRes = await warehouseClient.requestJson<PurchaseDetailDTO>(
      `/api/purchases/${purchase.id}/payment`,
      {
        method: 'PATCH',
        json: {
          paymentStatus: 'PAID',
          notes: 'Dilunasi via transfer BCA Rekening Toko',
        },
      },
    )
    assert.equal(settleRes.status, 200)
    assert(settleRes.body.ok)
    assert.equal(settleRes.body.data.paymentStatus, 'PAID')

    // 11. Query Purchases with Filter (paymentStatus = PAID)
    const paidListRes = await warehouseClient.requestJson<
      PaginatedResult<PurchaseSummaryDTO>
    >('/api/purchases?paymentStatus=PAID')
    assert.equal(paidListRes.status, 200)
    assert(paidListRes.body.ok)
    assert.equal(paidListRes.body.data.items.length, 1)
    assert.equal(paidListRes.body.data.items[0]?.id, purchase.id)
  })
})
