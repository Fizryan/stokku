import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import type {
  CategoryDTO,
  PaginatedResult,
  ProductDTO,
  UserDTO,
} from '../src/shared/types.js'
import { createTestHarness, type TestHarness } from './helpers/test-app.js'

describe('Catalog & Category Management (CRUD, Invariants & Hierarchy)', () => {
  let harness: TestHarness | null = null

  afterEach(() => {
    harness?.dispose()
    harness = null
  })

  it('manages category lifecycle, handles duplicate conflicts and enforces product FK constraints', async () => {
    harness = createTestHarness()
    const client = harness.createClient()

    // 1. Initial setup
    const setupRes = await client.requestJson<{ user: UserDTO }>('/api/auth/setup', {
      method: 'POST',
      json: {
        fullName: 'Catalog Manager Owner',
        username: 'owner',
        password: 'password123',
      },
    })
    assert.equal(setupRes.status, 201)

    // 2. Create categories
    const cat1Res = await client.requestJson<CategoryDTO>('/api/categories', {
      method: 'POST',
      json: {
        name: 'Minuman Segar',
        description: 'Kategori aneka minuman dingin dan hangat',
      },
    })
    assert.equal(cat1Res.status, 201)
    assert(cat1Res.body.ok)
    assert.equal(cat1Res.body.data.name, 'Minuman Segar')
    const cat1Id = cat1Res.body.data.id

    // Duplicate name conflict test
    const dupRes = await client.requestJson<CategoryDTO>('/api/categories', {
      method: 'POST',
      json: {
        name: 'Minuman Segar',
      },
    })
    assert.equal(dupRes.status, 409)
    assert.equal(dupRes.body.ok, false)

    // Create second category
    const cat2Res = await client.requestJson<CategoryDTO>('/api/categories', {
      method: 'POST',
      json: {
        name: 'Makanan Ringan',
        description: 'Snack dan camilan',
      },
    })
    assert.equal(cat2Res.status, 201)
    assert(cat2Res.body.ok)
    const cat2Id = cat2Res.body.data.id

    // 3. List categories
    const listRes = await client.requestJson<readonly CategoryDTO[]>('/api/categories')
    assert.equal(listRes.status, 200)
    assert(listRes.body.ok)
    assert.equal(listRes.body.data.length, 2)

    // 4. Update category
    const updateRes = await client.requestJson<CategoryDTO>(`/api/categories/${cat1Id}`, {
      method: 'PUT',
      json: {
        name: 'Minuman & Kopi',
        description: 'Aneka minuman segar dan seduhan kopi',
      },
    })
    assert.equal(updateRes.status, 200)
    assert(updateRes.body.ok)
    assert.equal(updateRes.body.data.name, 'Minuman & Kopi')

    // Update non-existent category
    const updateNotFound = await client.requestJson<CategoryDTO>('/api/categories/9999', {
      method: 'PUT',
      json: { name: 'Non Existent' },
    })
    assert.equal(updateNotFound.status, 404)

    // Update with duplicate name
    const updateDup = await client.requestJson<CategoryDTO>(`/api/categories/${cat2Id}`, {
      method: 'PUT',
      json: { name: 'Minuman & Kopi' },
    })
    assert.equal(updateDup.status, 409)

    // 5. Create product linked to category 1
    const prodRes = await client.requestJson<ProductDTO>('/api/products', {
      method: 'POST',
      json: {
        sku: 'MIN-001',
        name: 'Es Kopi Susu Gula Aren',
        unit: 'CUP',
        costPrice: 8000,
        sellPrice: 15000,
        categoryId: cat1Id,
        minStockAlert: 5,
      },
    })
    assert.equal(prodRes.status, 201)
    assert(prodRes.body.ok)
    const prodId = prodRes.body.data.id

    // 6. Delete category 1 must fail due to FK product association
    const delFkFail = await client.requestJson(`/api/categories/${cat1Id}`, {
      method: 'DELETE',
    })
    assert.equal(delFkFail.status, 409)

    // 7. Delete category 2 (no products) must succeed
    const delCat2 = await client.requestJson(`/api/categories/${cat2Id}`, {
      method: 'DELETE',
    })
    assert.equal(delCat2.status, 200)

    // Delete non-existent category
    const delNotFound = await client.requestJson('/api/categories/9999', {
      method: 'DELETE',
    })
    assert.equal(delNotFound.status, 404)

    // 8. Update product
    const updateProdRes = await client.requestJson<ProductDTO>(
      `/api/products/${prodId}`,
      {
        method: 'PUT',
        json: {
          sku: 'MIN-001',
          barcode: null,
          name: 'Es Kopi Susu Aren Spesial',
          unit: 'cup',
          costPrice: 8000,
          sellPrice: 18000,
          categoryId: cat1Id,
          minStockQty: 10,
          isActive: true,
        },
      },
    )
    assert.equal(updateProdRes.status, 200)
    assert(updateProdRes.body.ok)
    assert.equal(updateProdRes.body.data.sellPrice, 18000)

    // Update non-existent product
    const updateProdNotFound = await client.requestJson<ProductDTO>(
      '/api/products/9999',
      {
        method: 'PUT',
        json: {
          sku: 'GHOST-01',
          name: 'Ghost Product',
          unit: 'pcs',
          costPrice: 5000,
          sellPrice: 10000,
          minStockQty: 5,
          isActive: true,
        },
      },
    )
    assert.equal(updateProdNotFound.status, 404)

    // 9. Query products with filters & search
    const prodListRes = await client.requestJson<PaginatedResult<ProductDTO>>(
      `/api/products?search=Aren&categoryId=${cat1Id}&status=active&page=1&pageSize=10`,
    )
    assert.equal(prodListRes.status, 200)
    assert(prodListRes.body.ok)
    assert.equal(prodListRes.body.data.items.length, 1)

    // Query with archived status
    const prodArchivedRes = await client.requestJson<PaginatedResult<ProductDTO>>(
      '/api/products?status=archived',
    )
    assert.equal(prodArchivedRes.status, 200)
    assert(prodArchivedRes.body.ok)
    assert.equal(prodArchivedRes.body.data.items.length, 0)
  })
})
