import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import {
  calculateCashRounding,
  generateReceiptSignature,
  verifyReceiptSignature,
} from '../src/server/services/pos.service.js'
import type {
  DashboardMetricsDTO,
  ProductDTO,
  ReceiptVerificationResult,
  SaleDetailDTO,
  UserDTO,
} from '../src/shared/types.js'
import {
  createTestHarness,
  type TestHarness,
  type TestHttpClient,
} from './helpers/test-app.js'

type ProductFixture = {
  sku: string
  barcode: string
  name: string
  unit: string
  costPrice: number
  sellPrice: number
  initialStock: number
}

async function setupOwner(
  client: TestHttpClient,
  fullName: string,
  username: string,
): Promise<void> {
  const res = await client.requestJson<{ user: UserDTO }>('/api/auth/setup', {
    method: 'POST',
    json: { fullName, username, password: 'password123' },
  })
  assert(res.body.ok)
}

async function createProduct(
  client: TestHttpClient,
  fixture: ProductFixture,
): Promise<ProductDTO> {
  const res = await client.requestJson<ProductDTO>('/api/products', {
    method: 'POST',
    json: { ...fixture, categoryId: null, minStockQty: 1 },
  })
  assert(res.body.ok)
  return res.body.data
}

async function openShift(client: TestHttpClient, openingCash = 100_000): Promise<void> {
  const res = await client.requestJson('/api/shifts/open', {
    method: 'POST',
    json: { openingCash, notes: null },
  })
  assert.equal(res.status, 201)
}

async function checkout(
  client: TestHttpClient,
  items: { productId: number; qty: number }[],
  paidAmount: number,
  paymentMethod = 'CASH',
  discountAmount = 0,
) {
  return client.requestJson<SaleDetailDTO>('/api/sales', {
    method: 'POST',
    json: { items, paymentMethod, paidAmount, discountAmount, customerName: null },
  })
}

async function voidSale(client: TestHttpClient, saleId: number, reason: string) {
  return client.requestJson<SaleDetailDTO>(`/api/sales/${saleId}/void`, {
    method: 'POST',
    json: { reason },
  })
}

function makeMockSale(overrides: Partial<SaleDetailDTO> = {}): SaleDetailDTO {
  return {
    id: 1,
    invoiceNumber: 'INV-TEST-0001',
    cashierUserId: 1,
    cashierName: 'Kasir Test',
    shiftId: null,
    customerId: null,
    customerName: null,
    pointsEarned: 0,
    pointsRedeemed: 0,
    pointsDiscountAmount: 0,
    itemCount: 1,
    totalQty: 1,
    subtotalAmount: 10_000,
    discountAmount: 0,
    totalAmount: 10_000,
    grossProfitAmount: null,
    paymentMethod: 'CASH',
    paidAmount: 10_000,
    changeAmount: 0,
    status: 'COMPLETED',
    voidReason: null,
    voidedByName: null,
    voidedAt: null,
    createdAt: new Date().toISOString(),
    items: [],
    ...overrides,
  }
}

describe('POS Checkout, Historical Snapshot & Void Reversal', () => {
  let harness: TestHarness | null = null

  afterEach(() => {
    harness?.dispose()
    harness = null
  })

  it('processes atomic multi-item checkout, preserves historical price/HPP snapshots, exports CSV, and restores stock on Owner void', async () => {
    harness = createTestHarness()
    const owner = harness.createClient()

    await setupOwner(owner, 'Owner Toko', 'owner')

    const prod1 = await createProduct(owner, {
      sku: 'SNACK-01',
      barcode: '8990001',
      name: 'Keripik Singkong Balado',
      unit: 'pcs',
      costPrice: 8_000,
      sellPrice: 12_000,
      initialStock: 20,
    })

    const prod2 = await createProduct(owner, {
      sku: 'SNACK-02',
      barcode: '8990002',
      name: 'Kacang Panggang Madu',
      unit: 'pcs',
      costPrice: 15_000,
      sellPrice: 22_000,
      initialStock: 10,
    })

    await openShift(owner, 150_000)

    const underpaidRes = await checkout(owner, [{ productId: prod1.id, qty: 2 }], 20_000)
    assert.equal(underpaidRes.status, 422)

    // subtotal=80.000, discount=5.000, total=75.000, profit=21.000
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

    const lookup1 = await owner.requestJson<ProductDTO>(
      '/api/products/lookup?code=8990001',
    )
    assert(lookup1.body.ok)
    assert.equal(lookup1.body.data.stockQty, 17)

    await owner.requestJson<ProductDTO>(`/api/products/${prod1.id}`, {
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
    })

    const historicalSale = await owner.requestJson<SaleDetailDTO>(`/api/sales/${sale.id}`)
    assert(historicalSale.body.ok)
    assert.equal(historicalSale.body.data.grossProfitAmount, 21_000)
    const item1Snapshot = historicalSale.body.data.items.find(
      (i) => i.productId === prod1.id,
    )
    assert.equal(item1Snapshot?.productNameSnapshot, 'Keripik Singkong Balado')
    assert.equal(item1Snapshot?.costPriceAtSale, 8_000)
    assert.equal(item1Snapshot?.sellPriceAtSale, 12_000)

    const dashRes = await owner.requestJson<DashboardMetricsDTO>('/api/dashboard?days=14')
    assert.equal(dashRes.status, 200)
    assert(dashRes.body.ok)
    assert.equal(dashRes.body.data.todayRevenueAmount, 75_000)
    assert.equal(dashRes.body.data.todayGrossProfitAmount, 21_000)

    const csvRes = await owner.requestRaw('/api/sales/export.csv')
    assert.equal(csvRes.status, 200)
    const csvText = await csvRes.text()
    assert(csvText.includes(sale.invoiceNumber))
    assert(csvText.includes('Pelanggan Setia'))

    const voidRes = await voidSale(owner, sale.id, 'Pelanggan salah pilih varian produk')
    assert.equal(voidRes.status, 200)
    assert(voidRes.body.ok)
    assert.equal(voidRes.body.data.status, 'VOIDED')
    assert.equal(voidRes.body.data.grossProfitAmount, 0)

    const afterVoid1 = await owner.requestJson<ProductDTO>(
      '/api/products/lookup?code=8990001',
    )
    const afterVoid2 = await owner.requestJson<ProductDTO>(
      '/api/products/lookup?code=8990002',
    )
    assert(afterVoid1.body.ok)
    assert(afterVoid2.body.ok)
    assert.equal(afterVoid1.body.data.stockQty, 20)
    assert.equal(afterVoid2.body.data.stockQty, 10)

    const doubleVoidRes = await voidSale(owner, sale.id, 'Percobaan void ulang')
    assert.equal(doubleVoidRes.status, 409)
  })

  //FITUR 1: Automated Cash Rounding Engine

  it('TC-CR-01: CASH rounds Rp 24.600 → Rp 25.000 (step 1.000)', () => {
    const result = calculateCashRounding(24_600, 'CASH', 1_000)
    assert.equal(result.originalAmount, 24_600)
    assert.equal(result.roundedAmount, 25_000)
    assert.equal(result.roundingDifference, 400)
    assert.equal(result.isRounded, true)
  })

  it('TC-CR-02: CASH rounds Rp 24.300 → Rp 24.000 (step 1.000)', () => {
    const result = calculateCashRounding(24_300, 'CASH', 1_000)
    assert.equal(result.originalAmount, 24_300)
    assert.equal(result.roundedAmount, 24_000)
    assert.equal(result.roundingDifference, -300)
    assert.equal(result.isRounded, true)
  })

  it('TC-CR-03: QRIS is never rounded — amount stays exact', () => {
    const result = calculateCashRounding(24_350, 'QRIS')
    assert.equal(result.roundedAmount, 24_350)
    assert.equal(result.roundingDifference, 0)
    assert.equal(result.isRounded, false)
  })

  it('TC-CR-04: CASH on exact multiple — zero rounding difference', () => {
    const result = calculateCashRounding(25_000, 'CASH')
    assert.equal(result.roundedAmount, 25_000)
    assert.equal(result.roundingDifference, 0)
    assert.equal(result.isRounded, false)
  })

  it('TC-CR-05: checkout totalAmount and changeAmount reflect rounded total', async () => {
    // 12.400 × 2 = 24.800 → rounds to 25.000; paid 30.000 → change 5.000
    harness = createTestHarness()
    const owner = harness.createClient()
    await setupOwner(owner, 'Owner Rounding', 'owner_cr')
    const prod = await createProduct(owner, {
      sku: 'RND-01',
      barcode: '7770001',
      name: 'Produk Uji Rounding',
      unit: 'pcs',
      costPrice: 10_000,
      sellPrice: 12_400,
      initialStock: 10,
    })
    await openShift(owner)
    const saleRes = await checkout(owner, [{ productId: prod.id, qty: 2 }], 30_000)
    assert.equal(saleRes.status, 201)
    assert(saleRes.body.ok)
    assert.equal(saleRes.body.data.totalAmount, 25_000)
    assert.equal(saleRes.body.data.changeAmount, 5_000)
  })

  //FITUR 2: Shift-Lock Integrity Guard on Void

  it('TC-SL-01: void succeeds when shift is OPEN', async () => {
    harness = createTestHarness()
    const owner = harness.createClient()
    await setupOwner(owner, 'Owner ShiftLock', 'owner_sl')
    const prod = await createProduct(owner, {
      sku: 'SL-01',
      barcode: '7771001',
      name: 'Produk Shift Lock',
      unit: 'pcs',
      costPrice: 5_000,
      sellPrice: 10_000,
      initialStock: 5,
    })
    await openShift(owner, 50_000)
    const saleRes = await checkout(owner, [{ productId: prod.id, qty: 1 }], 10_000)
    assert.equal(saleRes.status, 201)
    assert(saleRes.body.ok)
    const voidRes = await voidSale(owner, saleRes.body.data.id, 'void saat shift open')
    assert.equal(voidRes.status, 200)
    assert(voidRes.body.ok)
    assert.equal(voidRes.body.data.status, 'VOIDED')
  })

  it('TC-SL-02: void is rejected HTTP 400 when shift is CLOSED', async () => {
    harness = createTestHarness()
    const owner = harness.createClient()
    await setupOwner(owner, 'Owner ShiftClose', 'owner_sc')
    const prod = await createProduct(owner, {
      sku: 'SL-02',
      barcode: '7771002',
      name: 'Produk Shift Close',
      unit: 'pcs',
      costPrice: 5_000,
      sellPrice: 10_000,
      initialStock: 5,
    })
    await openShift(owner, 50_000)
    const saleRes = await checkout(owner, [{ productId: prod.id, qty: 1 }], 10_000)
    assert.equal(saleRes.status, 201)
    assert(saleRes.body.ok)
    const closeRes = await owner.requestJson('/api/shifts/close', {
      method: 'POST',
      json: { actualCash: 60_000, notes: null },
    })
    assert.equal(closeRes.status, 200)
    const voidRes = await voidSale(
      owner,
      saleRes.body.data.id,
      'void setelah shift closed',
    )
    assert.equal(voidRes.status, 400)
  })

  it('TC-SL-03: sale with null shiftId can always be voided (orphan-safe)', async () => {
    const { assertSaleCanBeVoided } = await import(
      '../src/server/services/pos.service.js'
    )
    assert.doesNotThrow(() =>
      assertSaleCanBeVoided(makeMockSale({ shiftId: null }), null),
    )
  })

  it('TC-SL-04: assertSaleCanBeVoided throws AppError 400 for a CLOSED shift', async () => {
    const { assertSaleCanBeVoided } = await import(
      '../src/server/services/pos.service.js'
    )
    const { AppError } = await import('../src/server/errors/app-error.js')
    const sale = makeMockSale({ id: 2, invoiceNumber: 'INV-TEST-0002', shiftId: 7 })
    assert.throws(
      () => assertSaleCanBeVoided(sale, { id: 7, status: 'CLOSED' }),
      (err: unknown) => {
        assert(err instanceof AppError)
        assert.equal(err.statusCode, 400)
        assert(err.message.includes('INV-TEST-0002'))
        assert(err.message.includes('Shift #7'))
        return true
      },
    )
  })

  //FITUR 3: Cryptographic Digital Receipt Signature

  it('TC-SIG-01: generateReceiptSignature produces SIG-XXXX-XXXX-XXXX-XXXX format', () => {
    const sig = generateReceiptSignature({
      invoiceNumber: 'INV-20250101-0001',
      totalAmount: 75_000,
      cashierUserId: 1,
      createdAt: '2025-01-01T08:00:00.000Z',
    })
    assert.match(sig, /^SIG-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/)
  })

  it('TC-SIG-02: verifyReceiptSignature returns isValid=true for the correct signature', () => {
    const payload = {
      invoiceNumber: 'INV-20250101-0002',
      totalAmount: 50_000,
      cashierUserId: 2,
      createdAt: '2025-01-01T09:00:00.000Z',
    }
    const sig = generateReceiptSignature(payload)
    const result = verifyReceiptSignature(payload as SaleDetailDTO, sig)
    assert.equal(result.isValid, true)
    assert(result.message.includes('terverifikasi asli'))
  })

  it('TC-SIG-03: verifyReceiptSignature returns isValid=false when payload is tampered', () => {
    const original = {
      invoiceNumber: 'INV-20250101-0003',
      totalAmount: 100_000,
      cashierUserId: 1,
      createdAt: '2025-01-01T10:00:00.000Z',
    }
    const sig = generateReceiptSignature(original)
    const tampered = { ...original, totalAmount: 999 } as SaleDetailDTO
    const result = verifyReceiptSignature(tampered, sig)
    assert.equal(result.isValid, false)
    assert(result.message.includes('tidak dapat diverifikasi'))
  })

  it('TC-SIG-04: verifyReceiptSignature returns isValid=false for a garbage signature', () => {
    const result = verifyReceiptSignature(
      makeMockSale({ invoiceNumber: 'INV-20250101-0004' }),
      'GARBAGE-NOT-A-REAL-SIG',
    )
    assert.equal(result.isValid, false)
  })

  it('TC-SIG-05: generateReceiptSignature is deterministic for identical input', () => {
    const payload = {
      invoiceNumber: 'INV-20250101-0005',
      totalAmount: 80_000,
      cashierUserId: 1,
      createdAt: '2025-01-01T12:00:00.000Z',
    }
    assert.equal(generateReceiptSignature(payload), generateReceiptSignature(payload))
  })

  it('TC-SIG-06: GET /api/sales/:id/verify returns isValid=true for the matching signature', async () => {
    harness = createTestHarness()
    const owner = harness.createClient()
    await setupOwner(owner, 'Owner Sig', 'owner_sig')
    const prod = await createProduct(owner, {
      sku: 'SIG-01',
      barcode: '7772001',
      name: 'Produk Uji Signature',
      unit: 'pcs',
      costPrice: 5_000,
      sellPrice: 10_000,
      initialStock: 10,
    })
    await openShift(owner)
    const saleRes = await checkout(owner, [{ productId: prod.id, qty: 1 }], 10_000)
    assert.equal(saleRes.status, 201)
    assert(saleRes.body.ok)
    const sale = saleRes.body.data
    const sig = generateReceiptSignature({
      invoiceNumber: sale.invoiceNumber,
      totalAmount: sale.totalAmount,
      cashierUserId: sale.cashierUserId,
      createdAt: sale.createdAt,
    })
    const verifyRes = await owner.requestJson<ReceiptVerificationResult>(
      `/api/sales/${sale.id}/verify?signature=${encodeURIComponent(sig)}`,
    )
    assert.equal(verifyRes.status, 200)
    assert(verifyRes.body.ok)
    assert.equal(verifyRes.body.data.isValid, true)
  })

  //FITUR 4: Multi-Item Stock Deficiency Diagnostic Matrix

  it('TC-STK-01: multi-item checkout succeeds when all stock is sufficient', async () => {
    harness = createTestHarness()
    const owner = harness.createClient()
    await setupOwner(owner, 'Owner Stock', 'owner_stk')
    const prodA = await createProduct(owner, {
      sku: 'STK-A',
      barcode: '7773001',
      name: 'Produk Stok A',
      unit: 'pcs',
      costPrice: 5_000,
      sellPrice: 10_000,
      initialStock: 5,
    })
    const prodB = await createProduct(owner, {
      sku: 'STK-B',
      barcode: '7773002',
      name: 'Produk Stok B',
      unit: 'pcs',
      costPrice: 3_000,
      sellPrice: 7_000,
      initialStock: 3,
    })
    await openShift(owner)
    const saleRes = await checkout(
      owner,
      [
        { productId: prodA.id, qty: 3 },
        { productId: prodB.id, qty: 2 },
      ],
      50_000,
    )
    assert.equal(saleRes.status, 201)
  })

  it('TC-STK-02: checkout with 2 deficient items returns error listing BOTH products', async () => {
    harness = createTestHarness()
    const owner = harness.createClient()
    await setupOwner(owner, 'Owner Deficiency', 'owner_def')
    const prodA = await createProduct(owner, {
      sku: 'DEF-A',
      barcode: '7774001',
      name: 'Mie Goreng Ayam',
      unit: 'pcs',
      costPrice: 2_000,
      sellPrice: 3_500,
      initialStock: 2,
    })
    const prodB = await createProduct(owner, {
      sku: 'DEF-B',
      barcode: '7774002',
      name: 'Kopi Sachet',
      unit: 'pcs',
      costPrice: 1_500,
      sellPrice: 2_500,
      initialStock: 1,
    })
    await openShift(owner, 50_000)
    const saleRes = await checkout(
      owner,
      [
        { productId: prodA.id, qty: 5 }, // stock 2
        { productId: prodB.id, qty: 4 }, // stock 1
      ],
      50_000,
    )
    assert.equal(saleRes.status, 409)
    const body = JSON.stringify(saleRes.body)
    assert(body.includes('Mie Goreng Ayam'))
    assert(body.includes('Kopi Sachet'))
  })

  it('TC-STK-03: duplicate productId rows are aggregated — not treated as separate stock checks', async () => {
    harness = createTestHarness()
    const owner = harness.createClient()
    await setupOwner(owner, 'Owner Dedup', 'owner_dd')
    const prod = await createProduct(owner, {
      sku: 'DD-01',
      barcode: '7775001',
      name: 'Produk Duplikat Test',
      unit: 'pcs',
      costPrice: 5_000,
      sellPrice: 10_000,
      initialStock: 3,
    })
    await openShift(owner)
    // qty 2 + qty 1 = 3 total, matches stock exactly
    const saleRes = await checkout(
      owner,
      [
        { productId: prod.id, qty: 2 },
        { productId: prod.id, qty: 1 },
      ],
      30_000,
    )
    assert.equal(saleRes.status, 201)
    assert(saleRes.body.ok)
    assert.equal(saleRes.body.data.totalQty, 3)
  })

  it('TC-STK-04: checkout with qty=0 is rejected by schema before reaching service', async () => {
    harness = createTestHarness()
    const owner = harness.createClient()
    await setupOwner(owner, 'Owner ZeroQty', 'owner_zq')
    const prod = await createProduct(owner, {
      sku: 'ZQ-01',
      barcode: '7776001',
      name: 'Produk Zero Qty',
      unit: 'pcs',
      costPrice: 5_000,
      sellPrice: 10_000,
      initialStock: 10,
    })
    await openShift(owner)
    const saleRes = await checkout(owner, [{ productId: prod.id, qty: 0 }], 10_000)
    assert.equal(saleRes.status, 422)
  })
})
