import type { DatabaseSync } from 'node:sqlite'
import { hasPermission } from '../../shared/constants.js'
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
import type { PosServiceContract } from '../contracts/services.contract.js'
import { runInImmediateTransaction } from '../db/transaction.js'
import { AppError } from '../errors/app-error.js'
import type { ProductRepository } from '../repositories/product.repo.js'
import type { SaleRepository } from '../repositories/sale.repo.js'
import type { InventoryService } from './inventory.service.js'

export interface PosServiceDeps {
  readonly db: DatabaseSync
  readonly productRepo: ProductRepository
  readonly saleRepo: SaleRepository
  readonly inventoryService: InventoryService
}

export class PosService implements PosServiceContract {
  private readonly deps: PosServiceDeps

  public constructor(deps: PosServiceDeps) {
    this.deps = deps
  }

  private canSeeFinancials(actor: UserDTO): boolean {
    return hasPermission(actor.role, 'dashboard:financials')
  }

  public checkout(actor: UserDTO, input: CheckoutSaleInput): SaleDetailDTO {
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

      if (input.discountAmount > subtotalAmount) {
        throw AppError.validation(
          'Nominal diskon tidak boleh melebihi subtotal belanja.',
          [{ path: 'discountAmount', message: 'Diskon melebihi subtotal.' }],
        )
      }

      const totalAmount = subtotalAmount - input.discountAmount
      if (input.paidAmount < totalAmount) {
        throw AppError.validation('Nominal pembayaran kurang dari total tagihan.', [
          {
            path: 'paidAmount',
            message: `Minimal pembayaran adalah Rp ${totalAmount.toLocaleString('id-ID')}.`,
          },
        ])
      }

      if (input.paymentMethod !== 'CASH' && input.paidAmount !== totalAmount) {
        throw AppError.validation(
          'Pembayaran non-tunai (QRIS / Transfer) harus sesuai persis dengan total tagihan.',
          [{ path: 'paidAmount', message: 'Nominal non-tunai harus pas.' }],
        )
      }

      const changeAmount = input.paidAmount - totalAmount
      const invoiceNumber = this.deps.saleRepo.generateNextInvoiceNumber(now)

      const saleId = this.deps.saleRepo.createSaleRecord({
        invoiceNumber,
        cashierUserId: actor.id,
        customerName: input.customerName,
        subtotalAmount,
        discountAmount: input.discountAmount,
        totalAmount,
        paymentMethod: input.paymentMethod,
        paidAmount: input.paidAmount,
        changeAmount,
        nowIso,
        items: resolvedItems,
      })

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
          actorUserId: actor.id,
          nowIso,
        })
      }

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
    const canViewAll = hasPermission(actor.role, 'sales:view_all')
    return this.deps.saleRepo.listPaginated(query, {
      includeFinancials: this.canSeeFinancials(actor),
      restrictToCashierId: canViewAll ? undefined : actor.id,
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

      const updated = this.deps.saleRepo.findDetailById(
        saleId,
        this.canSeeFinancials(actor),
      )
      if (!updated) {
        throw new Error('Failed to load voided sale detail.')
      }
      return updated
    })
  }
}
