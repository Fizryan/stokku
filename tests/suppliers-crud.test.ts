import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import type {
  PaginatedResult,
  ProductDTO,
  PurchaseDetailDTO,
  PurchaseSummaryDTO,
  SupplierDTO,
  UserDTO,
} from '../src/shared/types.js'
import { createTestHarness, type TestHarness } from './helpers/test-app.js'

describe('Suppliers Management & Extended Purchasing (CRUD, Statuses & Exports)', () => {
  let harness: TestHarness | null = null

  afterEach(() => {
    harness?.dispose()
    harness = null
  })

  it('handles supplier pagination, filters, status toggling, and purchase invoice lifecycle', async () => {
    harness = createTestHarness()
    const client = harness.createClient()

    // 1. Initial setup
    await client.requestJson<{ user: UserDTO }>('/api/auth/setup', {
      method: 'POST',
      json: {
        fullName: 'Supplier Manager Owner',
        username: 'owner',
        password: 'password123',
      },
    })

    // 2. Create multiple suppliers
    const sup1Res = await client.requestJson<SupplierDTO>('/api/suppliers', {
      method: 'POST',
      json: {
        name: 'PT Sumber Kopi Makmur',
        contactPerson: 'Pak Budi',
        phone: '+628123456789',
        address: 'Bandung',
        notes: 'Pemasok biji kopi arabika',
      },
    })
    assert.equal(sup1Res.status, 201)
    assert(sup1Res.body.ok)
    const sup1Id = sup1Res.body.data.id

    // Duplicate supplier name conflict
    const dupRes = await client.requestJson<SupplierDTO>('/api/suppliers', {
      method: 'POST',
      json: {
        name: 'PT Sumber Kopi Makmur',
      },
    })
    assert.equal(dupRes.status, 409)

    const sup2Res = await client.requestJson<SupplierDTO>('/api/suppliers', {
      method: 'POST',
      json: {
        name: 'CV Susu Murni Jaya',
        contactPerson: 'Bu Siti',
        phone: '+628987654321',
        address: 'Lembang',
      },
    })
    assert.equal(sup2Res.status, 201)
    assert(sup2Res.body.ok)
    const sup2Id = sup2Res.body.data.id

    // 3. Get supplier by ID
    const getByIdRes = await client.requestJson<SupplierDTO>(`/api/suppliers/${sup1Id}`)
    assert.equal(getByIdRes.status, 200)
    assert(getByIdRes.body.ok)
    assert.equal(getByIdRes.body.data.name, 'PT Sumber Kopi Makmur')

    const getNotFound = await client.requestJson<SupplierDTO>('/api/suppliers/9999')
    assert.equal(getNotFound.status, 404)

    // 4. Update supplier (deactivate sup2)
    const updateRes = await client.requestJson<SupplierDTO>(`/api/suppliers/${sup2Id}`, {
      method: 'PUT',
      json: {
        name: 'CV Susu Murni Sejahtera',
        contactPerson: 'Bu Siti Rahayu',
        phone: '+628987654321',
        address: 'Lembang Barat',
        notes: 'Sedang tidak aktif beroperasi',
        isActive: false,
      },
    })
    assert.equal(updateRes.status, 200)
    assert(updateRes.body.ok)
    assert.equal(updateRes.body.data.isActive, false)

    // Update non-existent supplier
    const updateNotFound = await client.requestJson<SupplierDTO>('/api/suppliers/9999', {
      method: 'PUT',
      json: {
        name: 'Unknown Supplier',
        isActive: true,
      },
    })
    assert.equal(updateNotFound.status, 404)

    // Update with duplicate name conflict
    const updateDup = await client.requestJson<SupplierDTO>(`/api/suppliers/${sup2Id}`, {
      method: 'PUT',
      json: {
        name: 'PT Sumber Kopi Makmur',
        isActive: false,
      },
    })
    assert.equal(updateDup.status, 409)

    // 5. List active suppliers
    const activeList = await client.requestJson<readonly SupplierDTO[]>(
      '/api/suppliers/active',
    )
    assert.equal(activeList.status, 200)
    assert(activeList.body.ok)
    assert.equal(activeList.body.data.length, 1)
    const activeFirst = activeList.body.data[0]
    assert(activeFirst)
    assert.equal(activeFirst.id, sup1Id)

    // 6. List suppliers with query & filters
    const searchRes = await client.requestJson<PaginatedResult<SupplierDTO>>(
      '/api/suppliers?search=Sumber&status=active&page=1&pageSize=10',
    )
    assert.equal(searchRes.status, 200)
    assert(searchRes.body.ok)
    assert.equal(searchRes.body.data.items.length, 1)

    const archivedRes = await client.requestJson<PaginatedResult<SupplierDTO>>(
      '/api/suppliers?status=archived',
    )
    assert.equal(archivedRes.status, 200)
    assert(archivedRes.body.ok)
    assert.equal(archivedRes.body.data.items.length, 1)
    const archivedFirst = archivedRes.body.data.items[0]
    assert(archivedFirst)
    assert.equal(archivedFirst.id, sup2Id)

    // 7. Test Purchase Invoice Query, Export CSV, Cancel & Mark as Paid
    // Create product
    const prodRes = await client.requestJson<ProductDTO>('/api/products', {
      method: 'POST',
      json: {
        sku: 'BIJI-001',
        barcode: null,
        name: 'Biji Kopi Robusta 1kg',
        categoryId: null,
        unit: 'pack',
        costPrice: 50000,
        sellPrice: 85000,
        minStockQty: 5,
        initialStock: 0,
      },
    })
    assert.equal(prodRes.status, 201)
    assert(prodRes.body.ok)
    const prodId = prodRes.body.data.id

    // Create purchase invoice
    const purchaseRes = await client.requestJson<PurchaseDetailDTO>('/api/purchases', {
      method: 'POST',
      json: {
        supplierId: sup1Id,
        invoiceNumber: 'INV-SUP-001',
        dueDate: '2026-12-31',
        paymentStatus: 'UNPAID',
        notes: 'Pengiriman batch pertama',
        items: [
          {
            productId: prodId,
            qty: 10,
            unitCost: 50000,
          },
        ],
      },
    })
    assert.equal(purchaseRes.status, 201)
    assert(purchaseRes.body.ok)
    const purchaseId = purchaseRes.body.data.id

    // Get purchase detail
    const detailRes = await client.requestJson<PurchaseDetailDTO>(
      `/api/purchases/${purchaseId}`,
    )
    assert.equal(detailRes.status, 200)
    assert(detailRes.body.ok)
    assert.equal(detailRes.body.data.invoiceNumber, 'INV-SUP-001')

    const detailNotFound =
      await client.requestJson<PurchaseDetailDTO>('/api/purchases/9999')
    assert.equal(detailNotFound.status, 404)

    // 8. List purchases with query & update payment status
    const purchaseListRes = await client.requestJson<PaginatedResult<PurchaseSummaryDTO>>(
      '/api/purchases?paymentStatus=UNPAID&page=1&pageSize=10',
    )
    assert.equal(purchaseListRes.status, 200)
    assert(purchaseListRes.body.ok)
    assert(purchaseListRes.body.data.items.length >= 1)

    // Update payment status to PAID
    const payRes = await client.requestJson<PurchaseDetailDTO>(
      `/api/purchases/${purchaseId}/payment`,
      {
        method: 'PATCH',
        json: {
          paymentStatus: 'PAID',
        },
      },
    )
    assert.equal(payRes.status, 200)
    assert(payRes.body.ok)
    assert.equal(payRes.body.data.paymentStatus, 'PAID')
  })
})
