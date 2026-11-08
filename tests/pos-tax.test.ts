import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import type {
  CustomerDTO,
  DashboardMetricsDTO,
  ProductDTO,
  SaleDetailDTO,
  UserDTO,
} from '../src/shared/types.js'
import { createTestHarness, type TestHarness } from './helpers/test-app.js'

describe('POS Store-Wide Tax (11%) Integration', () => {
  let harness: TestHarness | null = null

  afterEach(() => {
    harness?.dispose()
    harness = null
  })

  async function setupOwnerAndProduct(
    harness: TestHarness,
    productOverrides?: Partial<{
      sku: string
      name: string
      costPrice: number
      sellPrice: number
      initialStock: number
    }>,
  ): Promise<{ client: ReturnType<TestHarness['createClient']>; product: ProductDTO }> {
    const owner = harness.createClient()

    await owner.requestJson<{ user: UserDTO }>('/api/auth/setup', {
      method: 'POST',
      json: {
        fullName: 'Owner Toko',
        username: 'owner',
        password: 'password123',
      },
    })

    const prodRes = await owner.requestJson<ProductDTO>('/api/products', {
      method: 'POST',
      json: {
        sku: productOverrides?.sku ?? 'TAX-01',
        name: productOverrides?.name ?? 'Produk Uji Pajak',
        categoryId: null,
        unit: 'pcs',
        costPrice: productOverrides?.costPrice ?? 8_000,
        sellPrice: productOverrides?.sellPrice ?? 10_000,
        minStockQty: 0,
        initialStock: productOverrides?.initialStock ?? 10,
      },
    })
    assert.equal(prodRes.status, 201)
    assert(prodRes.body.ok)

    return { client: owner, product: prodRes.body.data }
  }

  async function openShift(
    client: ReturnType<TestHarness['createClient']>,
    openingCash = 100_000,
  ): Promise<void> {
    const openShiftRes = await client.requestJson('/api/shifts/open', {
      method: 'POST',
      json: { openingCash },
    })
    assert.equal(openShiftRes.status, 201)
  }

  it('voiding a tax-inclusive sale restores stock, reverses loyalty, and keeps the stored taxAmount', async () => {
    harness = createTestHarness()
    const { client: owner, product } = await setupOwnerAndProduct(harness)

    // Seed a loyal customer via API
    const custRes = await owner.requestJson<CustomerDTO>('/api/customers', {
      method: 'POST',
      json: {
        phone: '081234567890',
        name: 'Budi Santoso',
      },
    })
    assert.equal(custRes.status, 201)
    assert(custRes.body.ok)
    const customer = custRes.body.data
    assert.equal(customer.totalSpend, 0)
    assert.equal(customer.pointsBalance, 0)

    await openShift(owner)

    // Subtotal 10.000 -> Pajak 11% = 1.100 -> Total 11.100 (CASH, exact pay)
    // Loyalty: pre-tax 10.000 / 10.000 = 1 point earned
    const saleRes = await owner.requestJson<SaleDetailDTO>('/api/sales', {
      method: 'POST',
      json: {
        items: [{ productId: product.id, qty: 1 }],
        discountAmount: 0,
        paymentMethod: 'CASH',
        paidAmount: 11_100,
        customerId: customer.id,
      },
    })
    assert.equal(saleRes.status, 201)
    assert(saleRes.body.ok)
    const sale = saleRes.body.data
    assert.equal(sale.subtotalAmount, 10_000)
    assert.equal(sale.taxAmount, 1_100)
    assert.equal(sale.totalAmount, 11_100)

    // Stock deducted
    const lookup = await owner.requestJson<ProductDTO>(`/api/products/${product.id}`)
    assert(lookup.body.ok)
    assert.equal(lookup.body.data.stockQty, 9)

    // Customer metrics include the tax-inclusive total
    const custAfterSale = await owner.requestJson<CustomerDTO>(
      `/api/customers/${customer.id}`,
    )
    assert(custAfterSale.body.ok)
    assert.equal(custAfterSale.body.data.totalSpend, 11_100)
    assert.equal(custAfterSale.body.data.pointsBalance, 1)
    assert.equal(custAfterSale.body.data.visitCount, 1)

    // Void as OWNER
    const voidRes = await owner.requestJson<SaleDetailDTO>(`/api/sales/${sale.id}/void`, {
      method: 'POST',
      json: { reason: 'Salah input kasir, transaksi dibatalkan' },
    })
    assert.equal(voidRes.status, 200)
    assert(voidRes.body.ok)
    assert.equal(voidRes.body.data.status, 'VOIDED')

    // Stock restored
    const lookupAfterVoid = await owner.requestJson<ProductDTO>(
      `/api/products/${product.id}`,
    )
    assert(lookupAfterVoid.body.ok)
    assert.equal(lookupAfterVoid.body.data.stockQty, 10)

    // Customer totalSpend reduced by the TAX-INCLUSIVE total, points reversed
    const custAfterVoid = await owner.requestJson<CustomerDTO>(
      `/api/customers/${customer.id}`,
    )
    assert(custAfterVoid.body.ok)
    assert.equal(custAfterVoid.body.data.totalSpend, 0)
    assert.equal(custAfterVoid.body.data.pointsBalance, 0)
    assert.equal(custAfterVoid.body.data.visitCount, 0)

    // Voided sale keeps its stored taxAmount (not zeroed); only profit is zeroed
    const voidedSale = await owner.requestJson<SaleDetailDTO>(`/api/sales/${sale.id}`)
    assert(voidedSale.body.ok)
    assert.equal(voidedSale.body.data.status, 'VOIDED')
    assert.equal(voidedSale.body.data.taxAmount, 1_100)
    assert.equal(voidedSale.body.data.totalAmount, 11_100)
    assert.equal(voidedSale.body.data.grossProfitAmount, 0)
  })

  it('validates payment amounts against the tax-inclusive total (CASH change, underpay, non-cash exact match)', async () => {
    harness = createTestHarness()
    const { client: owner, product } = await setupOwnerAndProduct(harness)
    await openShift(owner)

    // Subtotal 10.000 -> Pajak 11% = 1.100 -> Total tagihan = 11.100
    const TOTAL = 11_100

    // 1. CASH overpay: change = paid - tax-inclusive total
    const overpayRes = await owner.requestJson<SaleDetailDTO>('/api/sales', {
      method: 'POST',
      json: {
        items: [{ productId: product.id, qty: 1 }],
        paymentMethod: 'CASH',
        paidAmount: 15_000,
      },
    })
    assert.equal(overpayRes.status, 201)
    assert(overpayRes.body.ok)
    assert.equal(overpayRes.body.data.totalAmount, TOTAL)
    assert.equal(overpayRes.body.data.changeAmount, 15_000 - TOTAL)

    // 2. CASH underpay below tax-inclusive total -> validation error (422)
    const underpayRes = await owner.requestJson<SaleDetailDTO>('/api/sales', {
      method: 'POST',
      json: {
        items: [{ productId: product.id, qty: 1 }],
        paymentMethod: 'CASH',
        paidAmount: TOTAL - 1,
      },
    })
    assert.equal(underpayRes.status, 422)
    assert(!underpayRes.body.ok)
    assert.equal(
      underpayRes.body.error?.message,
      'Nominal pembayaran kurang dari total tagihan.',
    )
    const underpayIssue = underpayRes.body.error?.issues?.find(
      (i) => i.path === 'paidAmount',
    )
    assert.equal(
      underpayIssue?.message,
      `Minimal pembayaran adalah Rp ${TOTAL.toLocaleString('id-ID')}.`,
    )

    // 3. QRIS overpay -> must match exactly
    const qrisOverRes = await owner.requestJson<SaleDetailDTO>('/api/sales', {
      method: 'POST',
      json: {
        items: [{ productId: product.id, qty: 1 }],
        paymentMethod: 'QRIS',
        paidAmount: TOTAL + 1_000,
      },
    })
    assert.equal(qrisOverRes.status, 422)
    assert(!qrisOverRes.body.ok)
    assert.equal(
      qrisOverRes.body.error?.message,
      'Pembayaran non-tunai (QRIS / Transfer) harus sesuai persis dengan total tagihan.',
    )
    const qrisOverIssue = qrisOverRes.body.error?.issues?.find(
      (i) => i.path === 'paidAmount',
    )
    assert.equal(qrisOverIssue?.message, 'Nominal non-tunai harus pas.')

    // 4. QRIS underpay (below total) -> underpay check fires before exact-match check
    const qrisUnderRes = await owner.requestJson<SaleDetailDTO>('/api/sales', {
      method: 'POST',
      json: {
        items: [{ productId: product.id, qty: 1 }],
        paymentMethod: 'QRIS',
        paidAmount: TOTAL - 500,
      },
    })
    assert.equal(qrisUnderRes.status, 422)
    assert(!qrisUnderRes.body.ok)
    assert.equal(
      qrisUnderRes.body.error?.message,
      'Nominal pembayaran kurang dari total tagihan.',
    )

    // 5. TRANSFER mismatch -> same exact-match error
    const transferRes = await owner.requestJson<SaleDetailDTO>('/api/sales', {
      method: 'POST',
      json: {
        items: [{ productId: product.id, qty: 1 }],
        paymentMethod: 'TRANSFER',
        paidAmount: TOTAL + 1,
      },
    })
    assert.equal(transferRes.status, 422)
    assert(!transferRes.body.ok)
    assert.equal(
      transferRes.body.error?.message,
      'Pembayaran non-tunai (QRIS / Transfer) harus sesuai persis dengan total tagihan.',
    )

    // 6. paid < total (regardless of method) -> min-payment message with computed total
    const minPayRes = await owner.requestJson<SaleDetailDTO>('/api/sales', {
      method: 'POST',
      json: {
        items: [{ productId: product.id, qty: 1 }],
        paymentMethod: 'CASH',
        paidAmount: 5_000,
      },
    })
    assert.equal(minPayRes.status, 422)
    assert(!minPayRes.body.ok)
    assert.equal(
      minPayRes.body.error?.message,
      'Nominal pembayaran kurang dari total tagihan.',
    )
    const minPayIssue = minPayRes.body.error?.issues?.find((i) => i.path === 'paidAmount')
    assert.equal(minPayIssue?.message, 'Minimal pembayaran adalah Rp 11.100.')
  })

  it('dashboard revenue includes tax while gross profit excludes tax', async () => {
    harness = createTestHarness()
    // Sell price 10.000, cost 8.000 -> profit margin 2.000 per unit (pre-tax)
    const { client: owner, product } = await setupOwnerAndProduct(harness, {
      sku: 'DASH-01',
      name: 'Produk Dashboard Pajak',
    })
    await openShift(owner)

    // Subtotal 10.000 -> Pajak 1.100 -> Total 11.100
    const saleRes = await owner.requestJson<SaleDetailDTO>('/api/sales', {
      method: 'POST',
      json: {
        items: [{ productId: product.id, qty: 1 }],
        paymentMethod: 'CASH',
        paidAmount: 11_100,
      },
    })
    assert.equal(saleRes.status, 201)
    assert(saleRes.body.ok)
    assert.equal(saleRes.body.data.totalAmount, 11_100)
    assert.equal(saleRes.body.data.taxAmount, 1_100)
    assert.equal(saleRes.body.data.grossProfitAmount, 2_000)

    const dashRes = await owner.requestJson<DashboardMetricsDTO>('/api/dashboard?days=7')
    assert.equal(dashRes.status, 200)
    assert(dashRes.body.ok)

    // Revenue is tax-inclusive (= sum of total_amount)
    assert.equal(dashRes.body.data.todayRevenueAmount, 11_100)
    // Gross profit EXCLUDES tax: (10.000 - 8.000) - 0 diskon = 2.000
    assert.equal(dashRes.body.data.todayGrossProfitAmount, 2_000)
  })

  it('CSV export row reports the tax-inclusive total for the sale', async () => {
    harness = createTestHarness()
    // Subtotal 12.000 -> Pajak 1.320 -> Total 13.320; profit 3.000
    const { client: owner, product } = await setupOwnerAndProduct(harness, {
      sku: 'CSV-01',
      name: 'Produk CSV Pajak',
      costPrice: 9_000,
      sellPrice: 12_000,
    })
    await openShift(owner)

    const saleRes = await owner.requestJson<SaleDetailDTO>('/api/sales', {
      method: 'POST',
      json: {
        items: [{ productId: product.id, qty: 1 }],
        paymentMethod: 'CASH',
        paidAmount: 13_320,
      },
    })
    assert.equal(saleRes.status, 201)
    assert(saleRes.body.ok)
    const sale = saleRes.body.data
    assert.equal(sale.totalAmount, 13_320)

    const csvRes = await owner.requestRaw('/api/sales/export.csv')
    assert.equal(csvRes.status, 200)
    const csvText = await csvRes.text()

    const saleLine = csvText
      .split('\r\n')
      .find((line) => line.includes(sale.invoiceNumber))
    assert(saleLine, 'Exported CSV must contain the sale row')

    // Columns: 0 Invoice, 1 Waktu, 2 Status, 3 Kasir, 4 Pelanggan, 5 Metode,
    // 6 Jumlah Jenis Item, 7 Total Qty, 8 Subtotal, 9 Diskon,
    // 10 Total Tagihan, 11 Estimasi Laba Kotor, 12 Catatan Pembatalan
    const columns = saleLine.split(',')
    assert.equal(columns[8], '12000') // Subtotal (pre-tax)
    assert.equal(columns[10], '13320') // Total Tagihan (tax-inclusive)
    assert.equal(columns[11], '3000') // Laba kotor excludes tax
  })

  it('rounds tax on pre-tax bases at Math.round boundaries (.5 rounds up, below .5 rounds down)', async () => {
    harness = createTestHarness()
    const { client: owner } = await setupOwnerAndProduct(harness, {
      sku: 'BASE-REF',
      name: 'Produk Referensi Pembulatan',
      sellPrice: 9_500,
    })
    await openShift(owner)

    // Sibling products tuned so (subtotal - discount) hits exact rounding boundaries
    const cases: Array<{
      sku: string
      sellPrice: number
      discountAmount: number
      preTaxBase: number
      expectedTax: number
      expectedTotal: number
      note: string
    }> = [
      {
        sku: 'RP-9500',
        sellPrice: 9_500,
        discountAmount: 0,
        preTaxBase: 9_500,
        expectedTax: 1_045, // 9.500 * 0.11 = 1.045 exactly (no rounding needed)
        expectedTotal: 10_545,
        note: 'base 9.500 -> tax exactly 1.045',
      },
      {
        sku: 'RP-9505',
        sellPrice: 9_505,
        discountAmount: 0,
        preTaxBase: 9_505,
        expectedTax: 1_046, // 9.505 * 0.11 = 1.045,55 -> Math.round -> 1.046 (up)
        expectedTotal: 10_551,
        note: 'base 9.505 -> tax 1.045,55 rounds up',
      },
      {
        sku: 'RP-9050',
        sellPrice: 9_050,
        discountAmount: 0,
        preTaxBase: 9_050,
        expectedTax: 996, // 9.050 * 0.11 = 995,5 -> Math.round .5 boundary -> 996 (up)
        expectedTotal: 10_046,
        note: 'base 9.050 -> exact .5 boundary rounds up',
      },
      {
        sku: 'RP-9095',
        sellPrice: 9_095,
        discountAmount: 0,
        preTaxBase: 9_095,
        expectedTax: 1_000, // 9.095 * 0.11 = 1.000,45 -> rounds down to 1.000
        expectedTotal: 10_095,
        note: 'base 9.095 -> tax 1.000,45 rounds down',
      },
    ]

    const productIds: number[] = []
    for (const testCase of cases) {
      const prodRes = await owner.requestJson<ProductDTO>('/api/products', {
        method: 'POST',
        json: {
          sku: testCase.sku,
          name: `Produk ${testCase.sku}`,
          categoryId: null,
          unit: 'pcs',
          costPrice: 1_000,
          sellPrice: testCase.sellPrice,
          minStockQty: 0,
          initialStock: 5,
        },
      })
      assert.equal(prodRes.status, 201)
      assert(prodRes.body.ok)
      productIds.push(prodRes.body.data.id)
    }

    for (const [idx, testCase] of cases.entries()) {
      const saleRes = await owner.requestJson<SaleDetailDTO>('/api/sales', {
        method: 'POST',
        json: {
          items: [{ productId: productIds[idx], qty: 1 }],
          discountAmount: testCase.discountAmount,
          paymentMethod: 'CASH',
          paidAmount: testCase.expectedTotal,
        },
      })
      assert.equal(saleRes.status, 201, testCase.note)
      assert(saleRes.body.ok, testCase.note)
      const sale = saleRes.body.data
      assert.equal(
        sale.subtotalAmount - sale.discountAmount,
        testCase.preTaxBase,
        testCase.note,
      )
      assert.equal(sale.taxAmount, testCase.expectedTax, testCase.note)
      assert.equal(
        sale.totalAmount,
        testCase.preTaxBase + testCase.expectedTax,
        testCase.note,
      )
      assert.equal(sale.totalAmount, testCase.expectedTotal, testCase.note)
    }
  })
})
