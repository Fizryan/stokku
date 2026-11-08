import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import type { CustomerDTO, PaginatedResult, UserDTO } from '../src/shared/types.js'
import { createTestHarness, type TestHarness } from './helpers/test-app.js'

describe('Customers Management (CRUD, Search & Points Invariants)', () => {
  let harness: TestHarness | null = null

  afterEach(() => {
    harness?.dispose()
    harness = null
  })

  it('manages customer profile updates, filtering, and points adjustment edge cases', async () => {
    harness = createTestHarness()
    const client = harness.createClient()

    // 1. Initial setup
    await client.requestJson<{ user: UserDTO }>('/api/auth/setup', {
      method: 'POST',
      json: {
        fullName: 'Customer Manager Owner',
        username: 'owner',
        password: 'password123',
      },
    })

    // 2. Create customer
    const createRes = await client.requestJson<CustomerDTO>('/api/customers', {
      method: 'POST',
      json: {
        name: 'Rian Pratama',
        phone: '+6281122334455',
        email: 'rian@example.com',
        address: 'Jl. Merdeka No. 10',
        notes: 'Pelanggan VIP',
      },
    })
    assert.equal(createRes.status, 201)
    assert(createRes.body.ok)
    const custId = createRes.body.data.id

    // 3. Get customer by ID
    const getRes = await client.requestJson<CustomerDTO>(`/api/customers/${custId}`)
    assert.equal(getRes.status, 200)
    assert(getRes.body.ok)
    assert.equal(getRes.body.data.name, 'Rian Pratama')

    const getNotFound = await client.requestJson<CustomerDTO>('/api/customers/9999')
    assert.equal(getNotFound.status, 404)

    // 4. Update customer
    const updateRes = await client.requestJson<CustomerDTO>(`/api/customers/${custId}`, {
      method: 'PATCH',
      json: {
        name: 'Rian Pratama Kusuma',
        email: 'rian.kusuma@example.com',
        address: 'Jl. Sudirman No. 45',
        notes: 'Upgrade ke Pelanggan Prioritas',
        isActive: true,
      },
    })
    assert.equal(updateRes.status, 200)
    assert(updateRes.body.ok)
    assert.equal(updateRes.body.data.name, 'Rian Pratama Kusuma')

    // Update non-existent customer
    const updateNotFound = await client.requestJson<CustomerDTO>('/api/customers/9999', {
      method: 'PATCH',
      json: {
        name: 'Ghost Customer',
        isActive: true,
      },
    })
    assert.equal(updateNotFound.status, 404)

    // 5. Query customers with search, status and pagination
    const queryActive = await client.requestJson<PaginatedResult<CustomerDTO>>(
      '/api/customers?search=Kusuma&status=active&page=1&pageSize=10',
    )
    assert.equal(queryActive.status, 200)
    assert(queryActive.body.ok)
    assert.equal(queryActive.body.data.items.length, 1)

    const queryInactive = await client.requestJson<PaginatedResult<CustomerDTO>>(
      '/api/customers?status=inactive',
    )
    assert.equal(queryInactive.status, 200)
    assert(queryInactive.body.ok)
    assert.equal(queryInactive.body.data.items.length, 0)

    // 6. Points adjustment edge cases
    // Adjust points to non-existent customer
    const adjustNotFound = await client.requestJson('/api/customers/9999/points', {
      method: 'POST',
      json: {
        points: 50,
        description: 'Bonus loyalitas tahun baru',
      },
    })
    assert.equal(adjustNotFound.status, 404)

    // Adjust points that would make balance negative
    const adjustNegativeFail = await client.requestJson(
      `/api/customers/${custId}/points`,
      {
        method: 'POST',
        json: {
          points: -500,
          description: 'Pengurangan poin ilegal',
        },
      },
    )
    assert.equal(adjustNegativeFail.status, 400)
  })
})
