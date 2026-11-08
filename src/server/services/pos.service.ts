import type { DatabaseSync } from 'node:sqlite'
import {
  hasPermission,
  LOYALTY_RULES,
  type PaymentMethod,
  TAX_RATE,
} from '../../shared/constants.js'
import type {
  CheckoutSaleInput,
  SalesQueryInput,
  VoidSaleInput,
} from '../../shared/schemas/index.js'
import type {
  PaginatedResult,
  SaleDetailDTO,
  SaleSummaryDTO,
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
        throw AppError.notFound(`Produk dengan ID #${productId} tidak ditemukan.`)
      }
      if (!product.isActive) {
        throw AppError.badRequest(
          `Produk "${product.name}" (${product.sku}) sedang diarsipkan dan tidak dapat dijual.`,
        )
      }
      if (product.stockQty < qty) {
        throw AppError.insufficientStock(
          `Stok "${product.name}" (${product.sku}) tidak mencukupi. Tersedia ${product.stockQty} ${product.unit}, diminta ${qty} ${product.unit}.`,
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
    taxAmount: number
    totalAmount: number
    changeAmount: number
    /** Pre-tax base (subtotal minus all discounts) — loyalty points are earned on this. */
    preTaxAmount: number
  } {
    const totalDiscount = discountAmount + pointsDiscountAmount
    if (totalDiscount > subtotalAmount) {
      throw AppError.validation(
        'Total diskon (termasuk diskon poin reward) tidak boleh melebihi subtotal belanja.',
        [{ path: 'discountAmount', message: 'Diskon melebihi subtotal belanja.' }],
      )
    }

    const taxAmount = Math.round((subtotalAmount - totalDiscount) * TAX_RATE)
    const totalAmount = subtotalAmount - totalDiscount + taxAmount
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
      taxAmount,
      totalAmount,
      changeAmount: paidAmount - totalAmount,
      preTaxAmount: subtotalAmount - totalDiscount,
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
      // Points are earned on the pre-tax amount (subtotal minus all discounts),
      // not the tax-inclusive total.
      const pointsEarned = loyalty.customerId
        ? Math.floor(payment.preTaxAmount / LOYALTY_RULES.SPEND_PER_POINT)
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
        taxAmount: payment.taxAmount,
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
}
