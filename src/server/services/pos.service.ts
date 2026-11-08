import { createHmac, timingSafeEqual } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import {
  hasPermission,
  LOYALTY_RULES,
  type PaymentMethod,
} from '../../shared/constants.js'
import type {
  CheckoutSaleInput,
  SalesQueryInput,
  VoidSaleInput,
} from '../../shared/schemas/index.js'
import type {
  CashRoundingResult,
  PaginatedResult,
  ReceiptVerificationResult,
  SaleDetailDTO,
  SaleSummaryDTO,
  StockDeficiencyItem,
  UserDTO,
} from '../../shared/types.js'
import type {
  AuditServiceContract,
  PosServiceContract,
} from '../contracts/services.contract.js'
import { runInImmediateTransaction } from '../db/transaction.js'
import { AppError } from '../errors/app-error.js'
import type { CustomerRepository } from '../repositories/customer.repo.js'
import type { ProductRecord, ProductRepository } from '../repositories/product.repo.js'
import type { SaleRepository } from '../repositories/sale.repo.js'
import type { ShiftRepository } from '../repositories/shift.repo.js'
import type { InventoryService } from './inventory.service.js'

// Automated Cash Rounding Engine
export function calculateCashRounding(
  amount: number,
  paymentMethod: string,
  step = 500,
): CashRoundingResult {
  if (paymentMethod !== 'CASH') {
    return {
      originalAmount: amount,
      roundedAmount: amount,
      roundingDifference: 0,
      isRounded: false,
    }
  }

  const roundedAmount = Math.round(amount / step) * step
  const roundingDifference = roundedAmount - amount

  return {
    originalAmount: amount,
    roundedAmount,
    roundingDifference,
    isRounded: roundingDifference !== 0,
  }
}

// Shift-Lock Integrity Guard on Void
export function assertSaleCanBeVoided(
  sale: SaleDetailDTO,
  shift: { id: number; status: string } | null | undefined,
): void {
  if (!shift) {
    return
  }

  if (shift.status === 'CLOSED') {
    throw AppError.badRequest(
      `Transaksi ${sale.invoiceNumber} tidak dapat dibatalkan karena Shift #${shift.id} sudah ditutup dan pembukuan kas telah direkonsiliasi. ` +
        'Hubungi supervisor untuk proses pengembalian melalui jalur resmi.',
    )
  }
}

// Cryptographic Digital Receipt Signature
function getReceiptSignatureKey(): string {
  return process.env.RECEIPT_SIGNATURE_KEY ?? 'stokku-receipt-integrity-v1'
}

export function generateReceiptSignature(payload: {
  invoiceNumber: string
  totalAmount: number
  cashierUserId: number
  createdAt: string
}): string {
  const rawPayload = [
    payload.invoiceNumber,
    payload.totalAmount.toString(),
    payload.cashierUserId.toString(),
    payload.createdAt,
  ].join('|')

  const signature = createHmac('sha256', getReceiptSignatureKey())
    .update(rawPayload, 'utf8')
    .digest('hex')
    .slice(0, 16)
    .toUpperCase()

  return `SIG-${signature.slice(0, 4)}-${signature.slice(4, 8)}-${signature.slice(8, 12)}-${signature.slice(12, 16)}`
}

export function verifyReceiptSignature(
  sale: SaleDetailDTO,
  providedSignature: string,
): ReceiptVerificationResult {
  const verifiedAt = new Date().toISOString()

  if (!providedSignature || typeof providedSignature !== 'string') {
    return {
      isValid: false,
      invoiceNumber: sale.invoiceNumber,
      verifiedAt,
      message: 'Format tanda tangan tidak valid.',
    }
  }

  const expectedSignature = generateReceiptSignature({
    invoiceNumber: sale.invoiceNumber,
    totalAmount: sale.totalAmount,
    cashierUserId: sale.cashierUserId,
    createdAt: sale.createdAt,
  })

  // Constant-time comparison untuk mencegah timing attack
  const expected = Buffer.from(expectedSignature, 'utf8')
  const provided = Buffer.from(providedSignature.trim(), 'utf8')

  const isValid =
    expected.length === provided.length && timingSafeEqual(expected, provided)

  return {
    isValid,
    invoiceNumber: sale.invoiceNumber,
    verifiedAt,
    message: isValid
      ? `Struk ${sale.invoiceNumber} terverifikasi asli (HMAC-SHA256).`
      : `Tanda tangan tidak cocok. Struk ${sale.invoiceNumber} tidak dapat diverifikasi keasliannya.`,
  }
}

//Multi-Item Stock Deficiency Diagnostic Matrix
export function diagnoseStockDeficiencies(
  items: ReadonlyArray<{ productId: number; qty: number }>,
  productsMap: ReadonlyMap<
    number,
    { id: number; sku: string; name: string; unit: string; stockQty: number }
  >,
): readonly StockDeficiencyItem[] {
  const deficiencies: StockDeficiencyItem[] = []

  for (const item of items) {
    const product = productsMap.get(item.productId)
    if (!product) continue
    if (product.stockQty < item.qty) {
      deficiencies.push({
        productId: product.id,
        sku: product.sku,
        name: product.name,
        unit: product.unit,
        requestedQty: item.qty,
        availableQty: product.stockQty,
        deficitQty: item.qty - product.stockQty,
      })
    }
  }

  return deficiencies
}

export interface PosServiceDeps {
  readonly db: DatabaseSync
  readonly productRepo: ProductRepository
  readonly saleRepo: SaleRepository
  readonly inventoryService: InventoryService
  readonly shiftRepo: ShiftRepository
  readonly customerRepo?: CustomerRepository
  readonly auditService?: AuditServiceContract
}

interface RecordLoyaltyMutationsParams {
  readonly customerId: number | null
  readonly totalAmount: number
  readonly pointsEarned: number
  readonly pointsRedeemed: number
  readonly pointsDiscountAmount: number
  readonly saleId: number
  readonly invoiceNumber: string
  readonly actorId: number
  readonly nowIso: string
}

export class PosService implements PosServiceContract {
  private readonly deps: PosServiceDeps

  public constructor(deps: PosServiceDeps) {
    this.deps = deps
  }

  private canSeeFinancials(actor: UserDTO): boolean {
    return hasPermission(actor.role, 'dashboard:financials')
  }

  private validateAndResolveItems(
    sortedProductIds: readonly number[],
    qtyByProductId: ReadonlyMap<number, number>,
  ): {
    productsMap: Map<number, ProductRecord>
    resolvedItems: Array<{
      productId: number
      skuSnapshot: string
      productNameSnapshot: string
      unitSnapshot: string
      qty: number
      costPriceAtSale: number
      sellPriceAtSale: number
      lineSubtotal: number
    }>
    subtotalAmount: number
  } {
    const productsMap = this.deps.productRepo.findByIds(sortedProductIds)

    for (const productId of sortedProductIds) {
      const product = productsMap.get(productId)
      if (!product) {
        throw AppError.notFound(`Produk dengan ID #${productId} tidak ditemukan.`)
      }
      if (!product.isActive) {
        throw AppError.badRequest(
          `Produk "${product.name}" (${product.sku}) sedang diarsipkan dan tidak dapat dijual.`,
        )
      }
    }

    const aggregatedItems = sortedProductIds.map((id) => ({
      productId: id,
      qty: qtyByProductId.get(id) ?? 0,
    }))
    const deficiencies = diagnoseStockDeficiencies(aggregatedItems, productsMap)
    if (deficiencies.length > 0) {
      const deficiencyDetails = deficiencies.map(
        (d) =>
          `"${d.name}" (${d.sku}): diminta ${d.requestedQty} ${d.unit}, tersedia ${d.availableQty} ${d.unit} (kurang ${d.deficitQty})`,
      )
      throw AppError.insufficientStock(
        `Stok tidak mencukupi untuk ${deficiencies.length} produk:\n${deficiencyDetails.join('\n')}`,
      )
    }

    let subtotalAmount = 0
    const resolvedItems: Array<{
      productId: number
      skuSnapshot: string
      productNameSnapshot: string
      unitSnapshot: string
      qty: number
      costPriceAtSale: number
      sellPriceAtSale: number
      lineSubtotal: number
    }> = []

    for (const productId of sortedProductIds) {
      const qty = qtyByProductId.get(productId) ?? 0
      const product = productsMap.get(productId)

      if (!product) {
        throw new Error(
          `Invariant violation: product #${productId} missing after diagnostic.`,
        )
      }

      const lineSubtotal = product.sellPrice * qty
      subtotalAmount += lineSubtotal

      resolvedItems.push({
        productId: product.id,
        skuSnapshot: product.sku,
        productNameSnapshot: product.name,
        unitSnapshot: product.unit,
        qty,
        costPriceAtSale: product.costPrice,
        sellPriceAtSale: product.sellPrice,
        lineSubtotal,
      })
    }

    return { productsMap, resolvedItems, subtotalAmount }
  }

  private resolveCustomerLoyalty(
    customerIdInput?: number | null,
    pointsRedeemedInput = 0,
    customerNameInput?: string | null,
  ): {
    customerId: number | null
    resolvedCustomerName: string | null
    pointsRedeemed: number
    pointsDiscountAmount: number
  } {
    if (!customerIdInput || !this.deps.customerRepo) {
      return {
        customerId: null,
        resolvedCustomerName: customerNameInput ?? null,
        pointsRedeemed: 0,
        pointsDiscountAmount: 0,
      }
    }

    const customer = this.deps.customerRepo.findById(customerIdInput)
    if (!customer) {
      throw AppError.notFound(`Pelanggan dengan ID #${customerIdInput} tidak ditemukan.`)
    }
    if (!customer.isActive) {
      throw AppError.badRequest(`Akun pelanggan "${customer.name}" sedang tidak aktif.`)
    }

    if (pointsRedeemedInput <= 0) {
      return {
        customerId: customer.id,
        resolvedCustomerName: customer.name,
        pointsRedeemed: 0,
        pointsDiscountAmount: 0,
      }
    }

    if (pointsRedeemedInput > customer.pointsBalance) {
      throw AppError.badRequest(
        `Poin yang ditukarkan (${pointsRedeemedInput} poin) melebihi saldo pelanggan (${customer.pointsBalance} poin).`,
      )
    }

    return {
      customerId: customer.id,
      resolvedCustomerName: customer.name,
      pointsRedeemed: pointsRedeemedInput,
      pointsDiscountAmount: pointsRedeemedInput * LOYALTY_RULES.POINT_VALUE_IN_RUPIAH,
    }
  }

  private validatePaymentAndTotals(
    subtotalAmount: number,
    discountAmount: number,
    pointsDiscountAmount: number,
    paidAmount: number,
    paymentMethod: PaymentMethod,
  ): {
    totalDiscount: number
    totalAmount: number
    changeAmount: number
  } {
    const totalDiscount = discountAmount + pointsDiscountAmount
    if (totalDiscount > subtotalAmount) {
      throw AppError.validation(
        'Total diskon (termasuk diskon poin reward) tidak boleh melebihi subtotal belanja.',
        [{ path: 'discountAmount', message: 'Diskon melebihi subtotal belanja.' }],
      )
    }

    const baseTotal = subtotalAmount - totalDiscount
    const rounding = calculateCashRounding(baseTotal, paymentMethod)
    const totalAmount = rounding.roundedAmount

    if (paidAmount < totalAmount) {
      throw AppError.validation('Nominal pembayaran kurang dari total tagihan.', [
        {
          path: 'paidAmount',
          message: `Minimal pembayaran adalah Rp ${totalAmount.toLocaleString('id-ID')}.`,
        },
      ])
    }

    if (paymentMethod !== 'CASH' && paidAmount !== totalAmount) {
      throw AppError.validation(
        'Pembayaran non-tunai (QRIS / Transfer) harus sesuai persis dengan total tagihan.',
        [{ path: 'paidAmount', message: 'Nominal non-tunai harus pas.' }],
      )
    }

    return {
      totalDiscount,
      totalAmount,
      changeAmount: paidAmount - totalAmount,
    }
  }

  private recordStockDeductions(
    saleId: number,
    invoiceNumber: string,
    actorId: number,
    nowIso: string,
    sortedProductIds: readonly number[],
    productsMap: Map<number, ProductRecord>,
    qtyByProductId: ReadonlyMap<number, number>,
  ): void {
    for (const productId of sortedProductIds) {
      const product = productsMap.get(productId)
      const qty = qtyByProductId.get(productId)
      if (!product || qty === undefined) {
        throw new Error(
          `Invariant violation: missing product or quantity for #${productId} during checkout.`,
        )
      }
      this.deps.inventoryService.deductStockForSaleItemInTx({
        product,
        qty,
        saleId,
        invoiceNumber,
        actorUserId: actorId,
        nowIso,
      })
    }
  }

  private recordLoyaltyMutations(params: RecordLoyaltyMutationsParams): void {
    const {
      customerId,
      totalAmount,
      pointsEarned,
      pointsRedeemed,
      pointsDiscountAmount,
      saleId,
      invoiceNumber,
      actorId,
      nowIso,
    } = params
    if (!customerId || !this.deps.customerRepo) return

    const netPointsDelta = pointsEarned - pointsRedeemed
    this.deps.customerRepo.incrementSpendAndVisitInTx(
      customerId,
      totalAmount,
      netPointsDelta,
    )

    if (pointsRedeemed > 0) {
      this.deps.customerRepo.recordPointMutationInTx({
        customerId,
        points: -pointsRedeemed,
        mutationType: 'REDEEMED',
        referenceType: 'SALE',
        referenceId: saleId,
        description: `Tukar ${pointsRedeemed} poin (Diskon Rp ${pointsDiscountAmount.toLocaleString('id-ID')}) — ${invoiceNumber}`,
        actorUserId: actorId,
        nowIso,
      })
    }

    if (pointsEarned > 0) {
      this.deps.customerRepo.recordPointMutationInTx({
        customerId,
        points: pointsEarned,
        mutationType: 'EARNED',
        referenceType: 'SALE',
        referenceId: saleId,
        description: `Perolehan poin belanja — ${invoiceNumber}`,
        actorUserId: actorId,
        nowIso,
      })
    }
  }

  public checkout(actor: UserDTO, input: CheckoutSaleInput): SaleDetailDTO {
    const activeShift = this.deps.shiftRepo.findActiveByCashierId(actor.id)
    if (!activeShift) {
      throw AppError.badRequest(
        'Kasir wajib membuka shift terlebih dahulu sebelum memproses transaksi penjualan POS.',
      )
    }

    const qtyByProductId = new Map<number, number>()
    for (const item of input.items) {
      qtyByProductId.set(
        item.productId,
        (qtyByProductId.get(item.productId) ?? 0) + item.qty,
      )
    }

    const sortedProductIds = Array.from(qtyByProductId.keys()).sort((a, b) => a - b)
    const now = new Date()
    const nowIso = now.toISOString()
    const includeFinancials = this.canSeeFinancials(actor)

    return runInImmediateTransaction(this.deps.db, () => {
      const { productsMap, resolvedItems, subtotalAmount } = this.validateAndResolveItems(
        sortedProductIds,
        qtyByProductId,
      )

      const loyalty = this.resolveCustomerLoyalty(
        input.customerId,
        input.pointsRedeemed,
        input.customerName,
      )

      const payment = this.validatePaymentAndTotals(
        subtotalAmount,
        input.discountAmount,
        loyalty.pointsDiscountAmount,
        input.paidAmount,
        input.paymentMethod,
      )

      const invoiceNumber = this.deps.saleRepo.generateNextInvoiceNumber(now)
      const pointsEarned = loyalty.customerId
        ? Math.floor(payment.totalAmount / LOYALTY_RULES.SPEND_PER_POINT)
        : 0

      const saleId = this.deps.saleRepo.createSaleRecord({
        shiftId: activeShift.id,
        invoiceNumber,
        cashierUserId: actor.id,
        customerId: loyalty.customerId,
        customerName: loyalty.resolvedCustomerName,
        pointsEarned,
        pointsRedeemed: loyalty.pointsRedeemed,
        pointsDiscountAmount: loyalty.pointsDiscountAmount,
        subtotalAmount,
        discountAmount: payment.totalDiscount,
        totalAmount: payment.totalAmount,
        paymentMethod: input.paymentMethod,
        paidAmount: input.paidAmount,
        changeAmount: payment.changeAmount,
        nowIso,
        items: resolvedItems,
      })

      this.recordStockDeductions(
        saleId,
        invoiceNumber,
        actor.id,
        nowIso,
        sortedProductIds,
        productsMap,
        qtyByProductId,
      )

      this.recordLoyaltyMutations({
        customerId: loyalty.customerId,
        totalAmount: payment.totalAmount,
        pointsEarned,
        pointsRedeemed: loyalty.pointsRedeemed,
        pointsDiscountAmount: loyalty.pointsDiscountAmount,
        saleId,
        invoiceNumber,
        actorId: actor.id,
        nowIso,
      })

      const detail = this.deps.saleRepo.findDetailById(saleId, includeFinancials)
      if (!detail) {
        throw new Error('Failed to load newly created sale receipt.')
      }

      // Tanda tangan dibuat setelah data tersimpan di DB agar payload konsisten.
      const receiptSignature = generateReceiptSignature({
        invoiceNumber: detail.invoiceNumber,
        totalAmount: detail.totalAmount,
        cashierUserId: detail.cashierUserId,
        createdAt: detail.createdAt,
      })
      console.info(`[Receipt Signature] ${detail.invoiceNumber} → ${receiptSignature}`)

      return detail
    })
  }

  public listSales(
    actor: UserDTO,
    query: SalesQueryInput,
  ): PaginatedResult<SaleSummaryDTO> {
    const includeFinancials = this.canSeeFinancials(actor)
    const restrictToCashierId = hasPermission(actor.role, 'sales:view_all')
      ? undefined
      : actor.id

    return this.deps.saleRepo.listPaginated(query, {
      includeFinancials,
      restrictToCashierId,
    })
  }

  public getSaleDetail(actor: UserDTO, saleId: number): SaleDetailDTO {
    const detail = this.deps.saleRepo.findDetailById(saleId, this.canSeeFinancials(actor))
    if (!detail) {
      throw AppError.notFound('Transaksi penjualan tidak ditemukan.')
    }

    if (
      !hasPermission(actor.role, 'sales:view_all') &&
      detail.cashierUserId !== actor.id
    ) {
      throw AppError.forbidden(
        'Anda hanya dapat melihat detail transaksi yang Anda proses sendiri.',
      )
    }

    return detail
  }

  public voidSale(actor: UserDTO, saleId: number, input: VoidSaleInput): SaleDetailDTO {
    const nowIso = new Date().toISOString()

    return runInImmediateTransaction(this.deps.db, () => {
      const existing = this.deps.saleRepo.findDetailById(saleId, true)
      if (!existing) {
        throw AppError.notFound('Transaksi penjualan tidak ditemukan.')
      }
      if (existing.status === 'VOIDED') {
        throw AppError.conflict(
          `Transaksi ${existing.invoiceNumber} sudah pernah dibatalkan sebelumnya.`,
        )
      }

      // Mencegah pembatalan nota pada shift yang sudah CLOSED dan direkonsiliasi.
      if (existing.shiftId !== null) {
        const originalShift = this.deps.shiftRepo.findById(existing.shiftId)
        assertSaleCanBeVoided(existing, originalShift ?? null)
      }

      const marked = this.deps.saleRepo.markSaleVoided({
        saleId,
        reason: input.reason,
        voidedByUserId: actor.id,
        nowIso,
      })
      if (!marked) {
        throw AppError.conflict('Gagal membatalkan transaksi penjualan.')
      }

      const rawItems = this.deps.saleRepo.findRawItemsForVoid(saleId)
      const qtyByProductId = new Map<number, number>()
      for (const item of rawItems) {
        qtyByProductId.set(
          item.productId,
          (qtyByProductId.get(item.productId) ?? 0) + item.qty,
        )
      }

      const sortedIds = Array.from(qtyByProductId.keys()).sort((a, b) => a - b)
      const productsMap = this.deps.productRepo.findByIds(sortedIds)

      for (const productId of sortedIds) {
        const product = productsMap.get(productId)
        const qty = qtyByProductId.get(productId)
        if (!product || qty === undefined) {
          throw new Error(
            `Invariant violation: missing product or quantity for #${productId} during sale void.`,
          )
        }
        this.deps.inventoryService.restoreStockForVoidItemInTx({
          product,
          qty,
          saleId,
          invoiceNumber: existing.invoiceNumber,
          actorUserId: actor.id,
          nowIso,
        })
      }

      // Revert customer loyalty points & spend metrics
      if (existing.customerId && this.deps.customerRepo) {
        const netPointsReversal = existing.pointsRedeemed - existing.pointsEarned
        this.deps.customerRepo.decrementSpendAndVisitInTx(
          existing.customerId,
          existing.totalAmount,
          netPointsReversal,
        )

        if (existing.pointsRedeemed > 0) {
          this.deps.customerRepo.recordPointMutationInTx({
            customerId: existing.customerId,
            points: existing.pointsRedeemed,
            mutationType: 'VOID_RESTORED',
            referenceType: 'SALE',
            referenceId: saleId,
            description: `Pengembalian ${existing.pointsRedeemed} poin void transaksi — ${existing.invoiceNumber}`,
            actorUserId: actor.id,
            nowIso,
          })
        }

        if (existing.pointsEarned > 0) {
          this.deps.customerRepo.recordPointMutationInTx({
            customerId: existing.customerId,
            points: -existing.pointsEarned,
            mutationType: 'VOID_REVERSED',
            referenceType: 'SALE',
            referenceId: saleId,
            description: `Penarikan ${existing.pointsEarned} poin void transaksi — ${existing.invoiceNumber}`,
            actorUserId: actor.id,
            nowIso,
          })
        }
      }

      const updated = this.deps.saleRepo.findDetailById(
        saleId,
        this.canSeeFinancials(actor),
      )
      if (!updated) {
        throw new Error('Failed to load voided sale detail.')
      }

      if (this.deps.auditService) {
        this.deps.auditService.log({
          actor,
          actionType: 'SALE_VOIDED',
          resourceType: 'sale',
          resourceId: saleId,
          details: {
            invoiceNumber: existing.invoiceNumber,
            reason: input.reason,
            totalAmount: existing.totalAmount,
            cashierName: existing.cashierName,
          },
        })
      }

      return updated
    })
  }

  public verifyReceipt(
    actor: UserDTO,
    saleId: number,
    signature: string,
  ): ReceiptVerificationResult {
    const sale = this.getSaleDetail(actor, saleId)
    return verifyReceiptSignature(sale, signature)
  }
}
