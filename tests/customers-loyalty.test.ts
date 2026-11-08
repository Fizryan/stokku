import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { getLoyaltyTier } from '../src/shared/constants.js'
import type {
  CashShiftDetailDTO,
  CategoryDTO,
  CustomerDTO,
  CustomerPointMutationDTO,
  ProductDTO,
  SaleDetailDTO,
  UserDTO,
} from '../src/shared/types.js'
import { createTestHarness, type TestHarness } from './helpers/test-app.js'

describe('Customer & Loyalty Points Engine (Loyalty Rewards & Ledger Invariants)', () => {
  let harness: TestHarness | null = null

  afterEach(() => {
    harness?.dispose()
    harness = null
  })

  it('registers members, prevents duplicate phone, manages loyalty points on POS checkout, and restores points on void', async () => {
    harness = createTestHarness()
    const ownerClient = harness.createClient()
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

    // 2. Create Cashier user
    const cashierUserRes = await ownerClient.requestJson<UserDTO>('/api/users', {
      method: 'POST',
      json: {
        username: 'kasir_rina',
        fullName: 'Rina Kasir',
        role: 'CASHIER',
        password: 'password123',
      },
    })
    assert.equal(cashierUserRes.status, 201)
    assert(cashierUserRes.body.ok)

    const cashierLogin = await cashierClient.requestJson<{ user: UserDTO }>(
      '/api/auth/login',
      {
        method: 'POST',
        json: { username: 'kasir_rina', password: 'password123' },
      },
    )
    assert.equal(cashierLogin.status, 200)
    assert(cashierLogin.body.ok)

    // 3. Register Customer Member via Cashier
    const createCustRes = await cashierClient.requestJson<CustomerDTO>('/api/customers', {
      method: 'POST',
      json: {
        phone: '081234567890',
        name: 'Budi Santoso',
        email: 'budi@example.com',
        address: 'Jl. Merdeka No. 10',
        notes: 'Pelanggan VIP',
      },
    })
    assert.equal(createCustRes.status, 201)
    assert(createCustRes.body.ok)
    const customer = createCustRes.body.data
    assert.equal(customer.phone, '081234567890')
    assert.equal(customer.name, 'Budi Santoso')
    assert.equal(customer.pointsBalance, 0)
    assert.equal(customer.totalSpend, 0)
    assert.equal(customer.visitCount, 0)

    // 4. Duplicate phone rejection (409 Conflict)
    const duplicateRes = await cashierClient.requestJson<CustomerDTO>('/api/customers', {
      method: 'POST',
      json: {
        phone: '081234567890',
        name: 'Budi Kloning',
      },
    })
    assert.equal(duplicateRes.status, 409)
    assert(!duplicateRes.body.ok)

    // 5. Lookup by phone
    const lookupRes = await cashierClient.requestJson<CustomerDTO | null>(
      '/api/customers/by-phone/081234567890',
    )
    assert.equal(lookupRes.status, 200)
    assert(lookupRes.body.ok)
    assert.equal(lookupRes.body.data?.id, customer.id)

    // 6. Setup Product for POS checkout
    const catRes = await ownerClient.requestJson<CategoryDTO>('/api/categories', {
      method: 'POST',
      json: { name: 'Kopi & Minuman' },
    })
    assert.equal(catRes.status, 201)
    assert(catRes.body.ok)

    const prodRes = await ownerClient.requestJson<ProductDTO>('/api/products', {
      method: 'POST',
      json: {
        sku: 'KOPI-ARABICA',
        name: 'Kopi Arabica 250g',
        categoryId: catRes.body.data.id,
        unit: 'pack',
        costPrice: 20_000,
        sellPrice: 50_000,
        initialStock: 50,
      },
    })
    assert.equal(prodRes.status, 201)
    assert(prodRes.body.ok)
    const product = prodRes.body.data

    // 7. Cashier opens shift
    const openShiftRes = await cashierClient.requestJson<CashShiftDetailDTO>(
      '/api/shifts/open',
      {
        method: 'POST',
        json: { openingCash: 100_000, notes: 'Shift Pagi' },
      },
    )
    assert.equal(openShiftRes.status, 201)
    assert(openShiftRes.body.ok)

    // 8. First checkout with customer: 2 packs @ 50.000 = 100.000
    // Spend = Rp 100.000 -> Should earn 10 points (1 point per Rp 10.000)
    const sale1Res = await cashierClient.requestJson<SaleDetailDTO>('/api/sales', {
      method: 'POST',
      json: {
        items: [{ productId: product.id, qty: 2 }],
        discountAmount: 0,
        paymentMethod: 'CASH',
        paidAmount: 100_000,
        customerId: customer.id,
        pointsRedeemed: 0,
      },
    })
    assert.equal(sale1Res.status, 201)
    assert(sale1Res.body.ok)
    assert.equal(sale1Res.body.data.subtotalAmount, 100_000)
    assert.equal(sale1Res.body.data.totalAmount, 100_000)
    assert.equal(sale1Res.body.data.pointsEarned, 10)
    assert.equal(sale1Res.body.data.pointsRedeemed, 0)
    assert.equal(sale1Res.body.data.pointsDiscountAmount, 0)

    // Verify customer updated metrics
    const custAfterSale1 = await cashierClient.requestJson<CustomerDTO>(
      `/api/customers/${customer.id}`,
    )
    assert.equal(custAfterSale1.status, 200)
    assert(custAfterSale1.body.ok)
    assert.equal(custAfterSale1.body.data.pointsBalance, 10)
    assert.equal(custAfterSale1.body.data.totalSpend, 100_000)
    assert.equal(custAfterSale1.body.data.visitCount, 1)

    // 9. Validation: Trying to redeem 20 points when only having 10 points must fail
    const overRedeemRes = await cashierClient.requestJson<SaleDetailDTO>('/api/sales', {
      method: 'POST',
      json: {
        items: [{ productId: product.id, qty: 1 }],
        discountAmount: 0,
        paymentMethod: 'CASH',
        paidAmount: 50_000,
        customerId: customer.id,
        pointsRedeemed: 20,
      },
    })
    assert.equal(overRedeemRes.status, 400)
    assert(!overRedeemRes.body.ok)

    // 10. Second checkout: 1 pack @ 50.000, redeem 5 points (Rp 500 discount)
    // Net total = 50.000 - 500 = 49.500
    // Points earned from 49.500 = Math.floor(49.500 / 10.000) = 4 points
    const sale2Res = await cashierClient.requestJson<SaleDetailDTO>('/api/sales', {
      method: 'POST',
      json: {
        items: [{ productId: product.id, qty: 1 }],
        discountAmount: 0,
        paymentMethod: 'CASH',
        paidAmount: 50_000,
        customerId: customer.id,
        pointsRedeemed: 5,
      },
    })
    assert.equal(sale2Res.status, 201)
    assert(sale2Res.body.ok)
    const sale2 = sale2Res.body.data
    assert.equal(sale2.subtotalAmount, 50_000)
    assert.equal(sale2.discountAmount, 500)
    assert.equal(sale2.pointsDiscountAmount, 500)
    assert.equal(sale2.totalAmount, 49_500)
    assert.equal(sale2.pointsRedeemed, 5)
    assert.equal(sale2.pointsEarned, 4)
    assert.equal(sale2.changeAmount, 500)

    // Customer balance: 10 - 5 + 4 = 9 points; spend = 100.000 + 49.500 = 149.500; visits = 2
    const custAfterSale2 = await cashierClient.requestJson<CustomerDTO>(
      `/api/customers/${customer.id}`,
    )
    assert.equal(custAfterSale2.status, 200)
    assert(custAfterSale2.body.ok)
    assert.equal(custAfterSale2.body.data.pointsBalance, 9)
    assert.equal(custAfterSale2.body.data.totalSpend, 149_500)
    assert.equal(custAfterSale2.body.data.visitCount, 2)

    // Check points mutation history
    const mutationsRes = await cashierClient.requestJson<
      readonly CustomerPointMutationDTO[]
    >(`/api/customers/${customer.id}/mutations`)
    assert.equal(mutationsRes.status, 200)
    assert(mutationsRes.body.ok)
    // 3 mutations: EARNED (10), REDEEMED (-5), EARNED (+4)
    assert.equal(mutationsRes.body.data.length, 3)

    // 11. Void Sale 2 by Owner
    // Must restore 5 redeemed points and retract 4 earned points
    // Net balance should return to 9 - 4 + 5 = 10 points
    // Total spend should return to 149.500 - 49.500 = 100.000
    // Visit count should return to 1
    const voidRes = await ownerClient.requestJson<SaleDetailDTO>(
      `/api/sales/${sale2.id}/void`,
      {
        method: 'POST',
        json: { reason: 'Pelanggan membatalkan pesanan kedua' },
      },
    )
    assert.equal(voidRes.status, 200)
    assert(voidRes.body.ok)
    assert.equal(voidRes.body.data.status, 'VOIDED')

    const custAfterVoid = await cashierClient.requestJson<CustomerDTO>(
      `/api/customers/${customer.id}`,
    )
    assert.equal(custAfterVoid.status, 200)
    assert(custAfterVoid.body.ok)
    assert.equal(custAfterVoid.body.data.pointsBalance, 10)
    assert.equal(custAfterVoid.body.data.totalSpend, 100_000)
    assert.equal(custAfterVoid.body.data.visitCount, 1)

    // 12. Manual Points Adjustment by Owner (+25 bonus points)
    const adjustRes = await ownerClient.requestJson<CustomerDTO>(
      `/api/customers/${customer.id}/points`,
      {
        method: 'POST',
        json: {
          points: 25,
          description: 'Bonus loyalitas tahunan',
        },
      },
    )
    assert.equal(adjustRes.status, 200)
    assert(adjustRes.body.ok)
    assert.equal(adjustRes.body.data.pointsBalance, 35)

    // CASHIER forbidden from adjusting points manually (403)
    const cashierAdjustForbidden = await cashierClient.requestJson<CustomerDTO>(
      `/api/customers/${customer.id}/points`,
      {
        method: 'POST',
        json: {
          points: 10,
          description: 'Coba tambah poin sendiri',
        },
      },
    )
    assert.equal(cashierAdjustForbidden.status, 403)
    assert(!cashierAdjustForbidden.body.ok)
    // Kasir has customers:manage so let's verify if cashier can or if we check top list
    const topRes =
      await cashierClient.requestJson<readonly CustomerDTO[]>('/api/customers/top')
    assert.equal(topRes.status, 200)
    assert(topRes.body.ok)
    assert(topRes.body.data.length >= 1)
    assert.equal(topRes.body.data[0]?.id, customer.id)
  })
})

async function createLoyaltyFixture(harness: TestHarness, phone: string, sku: string) {
  const owner = harness.createClient()
  const setup = await owner.requestJson('/api/auth/setup', {
    method: 'POST',
    json: {
      fullName: 'Owner Loyalitas',
      username: 'owner_loyalty',
      password: 'password123',
    },
  })
  assert.equal(setup.status, 201)

  const customerResponse = await owner.requestJson<CustomerDTO>('/api/customers', {
    method: 'POST',
    json: { phone, name: 'Pelanggan Loyalitas' },
  })
  assert.equal(customerResponse.status, 201)
  assert(customerResponse.body.ok)

  const productResponse = await owner.requestJson<ProductDTO>('/api/products', {
    method: 'POST',
    json: {
      sku,
      name: 'Produk Loyalitas',
      categoryId: null,
      unit: 'pcs',
      costPrice: 20_000,
      sellPrice: 50_000,
      initialStock: 200,
    },
  })
  assert.equal(productResponse.status, 201)
  assert(productResponse.body.ok)

  const shift = await owner.requestJson('/api/shifts/open', {
    method: 'POST',
    json: { openingCash: 100_000, notes: 'Uji loyalitas' },
  })
  assert.equal(shift.status, 201)

  return {
    owner,
    customer: customerResponse.body.data,
    product: productResponse.body.data,
  }
}

async function checkoutLoyaltySale(
  owner: ReturnType<TestHarness['createClient']>,
  customerId: number,
  product: ProductDTO,
  qty: number,
  pointsRedeemed = 0,
) {
  return owner.requestJson<SaleDetailDTO>('/api/sales', {
    method: 'POST',
    json: {
      items: [{ productId: product.id, qty }],
      discountAmount: 0,
      paymentMethod: 'CASH',
      paidAmount: qty * product.sellPrice - pointsRedeemed * 100,
      customerId,
      pointsRedeemed,
    },
  })
}

describe('Loyalty tiers', () => {
  let harness: TestHarness | null = null

  afterEach(() => {
    harness?.dispose()
    harness = null
  })

  it('uses the correct tier immediately below and at each spend threshold', () => {
    assert.equal(getLoyaltyTier(999_999).name, 'Reguler')
    assert.equal(getLoyaltyTier(1_000_000).name, 'Silver')
    assert.equal(getLoyaltyTier(4_999_999).name, 'Silver')
    assert.equal(getLoyaltyTier(5_000_000).name, 'Gold')
  })

  it('applies the Silver bonus to checkout points', async () => {
    harness = createTestHarness()
    const { owner, customer, product } = await createLoyaltyFixture(
      harness,
      '083111111111',
      'TIER-SILVER',
    )
    harness.db
      .prepare('UPDATE customers SET total_spend = 1000000 WHERE id = ?')
      .run(customer.id)

    const sale = await checkoutLoyaltySale(owner, customer.id, product, 2)

    assert.equal(sale.status, 201)
    assert(sale.body.ok)
    assert.equal(sale.body.data.pointsEarned, 11)
  })

  it('downgrades the tier after void removes the qualifying spend', async () => {
    harness = createTestHarness()
    const { owner, customer, product } = await createLoyaltyFixture(
      harness,
      '083222222222',
      'TIER-GOLD',
    )
    harness.db
      .prepare('UPDATE customers SET total_spend = 4950000 WHERE id = ?')
      .run(customer.id)

    const sale = await checkoutLoyaltySale(owner, customer.id, product, 1)
    assert(sale.body.ok)
    const gold = await owner.requestJson<CustomerDTO>(`/api/customers/${customer.id}`)
    assert(gold.body.ok)
    assert.equal(gold.body.data.loyaltyTier.name, 'Gold')

    const voidResponse = await owner.requestJson(`/api/sales/${sale.body.data.id}/void`, {
      method: 'POST',
      json: { reason: 'Void uji tier' },
    })
    assert.equal(voidResponse.status, 200)

    const downgraded = await owner.requestJson<CustomerDTO>(
      `/api/customers/${customer.id}`,
    )
    assert(downgraded.body.ok)
    assert.equal(downgraded.body.data.loyaltyTier.name, 'Silver')
  })
})

describe('Loyalty point expiry', () => {
  let harness: TestHarness | null = null

  afterEach(() => {
    harness?.dispose()
    harness = null
  })

  it('expires earned points exactly 365 days after they are earned', async () => {
    harness = createTestHarness()
    const { owner, customer, product } = await createLoyaltyFixture(
      harness,
      '084111111111',
      'EXPIRY-DATE',
    )

    const sale = await checkoutLoyaltySale(owner, customer.id, product, 1)
    assert(sale.body.ok)
    const mutations = await owner.requestJson<readonly CustomerPointMutationDTO[]>(
      `/api/customers/${customer.id}/mutations`,
    )
    assert(mutations.body.ok)
    const earned = mutations.body.data.find((item) => item.mutationType === 'EARNED')
    assert(earned?.expiresAt)
    assert.equal(
      Date.parse(earned.expiresAt) - Date.parse(earned.createdAt),
      365 * 24 * 60 * 60 * 1000,
    )
  })

  it('does not allow redemption of expired points and records their expiry', async () => {
    harness = createTestHarness()
    const { owner, customer, product } = await createLoyaltyFixture(
      harness,
      '084222222222',
      'EXPIRY-BALANCE',
    )
    const adjustment = await owner.requestJson<CustomerDTO>(
      `/api/customers/${customer.id}/points`,
      {
        method: 'POST',
        json: { points: 10, description: 'Poin expired' },
      },
    )
    assert(adjustment.body.ok)
    harness.db
      .prepare("UPDATE customer_point_lots SET expires_at = '2000-01-01T00:00:00.000Z'")
      .run()

    const balance = await owner.requestJson<CustomerDTO>(`/api/customers/${customer.id}`)
    assert(balance.body.ok)
    assert.equal(balance.body.data.pointsBalance, 0)
    const rejectedSale = await checkoutLoyaltySale(owner, customer.id, product, 1, 1)
    assert.equal(rejectedSale.status, 400)

    await checkoutLoyaltySale(owner, customer.id, product, 1)
    const mutations = await owner.requestJson<readonly CustomerPointMutationDTO[]>(
      `/api/customers/${customer.id}/mutations`,
    )
    assert(mutations.body.ok)
    assert(mutations.body.data.some((item) => item.mutationType === 'EXPIRED'))
  })

  it('redeems the earliest-expiring lot first and restores it when the sale is voided', async () => {
    harness = createTestHarness()
    const { owner, customer, product } = await createLoyaltyFixture(
      harness,
      '084333333333',
      'EXPIRY-FIFO',
    )
    for (const description of ['first', 'second']) {
      const adjustment = await owner.requestJson<CustomerDTO>(
        `/api/customers/${customer.id}/points`,
        {
          method: 'POST',
          json: { points: 5, description },
        },
      )
      assert(adjustment.body.ok)
    }

    const expiries = [
      new Date(Date.now() + 10 * 86_400_000).toISOString(),
      new Date(Date.now() + 30 * 86_400_000).toISOString(),
    ]
    for (const [index, expiry] of expiries.entries()) {
      harness.db
        .prepare(`
          UPDATE customer_point_lots SET expires_at = ?
          WHERE source_mutation_id = (
            SELECT id FROM customer_point_mutations
            WHERE customer_id = ? AND description = ?
          )
        `)
        .run(expiry, customer.id, index === 0 ? 'first' : 'second')
    }

    const sale = await checkoutLoyaltySale(owner, customer.id, product, 1, 6)
    assert(sale.body.ok)
    const lotsBeforeVoid = harness.db
      .prepare(`
        SELECT l.remaining_points
        FROM customer_point_lots l
        INNER JOIN customer_point_mutations m ON m.id = l.source_mutation_id
        WHERE l.customer_id = ? AND m.mutation_type = 'ADJUSTMENT'
        ORDER BY l.expires_at
      `)
      .all(customer.id) as Array<{ remaining_points: number }>
    assert.deepEqual(
      lotsBeforeVoid.map((lot) => lot.remaining_points),
      [0, 4],
    )

    const voidResponse = await owner.requestJson(`/api/sales/${sale.body.data.id}/void`, {
      method: 'POST',
      json: { reason: 'Void uji pemulihan poin' },
    })
    assert.equal(voidResponse.status, 200)
    const balance = await owner.requestJson<CustomerDTO>(`/api/customers/${customer.id}`)
    assert(balance.body.ok)
    assert.equal(balance.body.data.pointsBalance, 10)
  })
})
