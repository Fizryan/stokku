import type { DatabaseSync } from 'node:sqlite'
import type {
  CreatePurchaseInput,
  PurchasesQueryInput,
  UpdatePurchasePaymentStatusInput,
} from '../../shared/schemas/index.js'
import type {
  PaginatedResult,
  PurchaseDetailDTO,
  PurchasePayablesSummaryDTO,
  PurchaseSummaryDTO,
  UserDTO,
} from '../../shared/types.js'
import type { PurchaseServiceContract } from '../contracts/services.contract.js'
import { runInImmediateTransaction } from '../db/transaction.js'
import { AppError } from '../errors/app-error.js'
import type { ProductRepository } from '../repositories/product.repo.js'
import type { PurchaseRepository } from '../repositories/purchase.repo.js'
import type { ReplenishmentRepository } from '../repositories/replenishment.repo.js'
import type { SupplierRepository } from '../repositories/supplier.repo.js'
import type { InventoryService } from './inventory.service.js'

export interface PurchaseServiceDeps {
  readonly db: DatabaseSync
  readonly purchaseRepo: PurchaseRepository
  readonly supplierRepo: SupplierRepository
  readonly productRepo: ProductRepository
  readonly inventoryService: InventoryService
  readonly replenishmentRepo: ReplenishmentRepository
}

export class PurchaseService implements PurchaseServiceContract {
  private readonly deps: PurchaseServiceDeps

  public constructor(deps: PurchaseServiceDeps) {
    this.deps = deps
  }

  public createPurchase(actor: UserDTO, input: CreatePurchaseInput): PurchaseDetailDTO {
    const supplier = this.deps.supplierRepo.findById(input.supplierId)
    if (!supplier) {
      throw AppError.notFound(`Supplier dengan ID #${input.supplierId} tidak ditemukan.`)
    }
    if (!supplier.isActive) {
      throw AppError.badRequest(
        `Supplier "${supplier.name}" sedang dinonaktifkan / diarsipkan.`,
      )
    }

    const existingInvoice = this.deps.purchaseRepo.findByInvoiceNumber(
      input.invoiceNumber,
    )
    if (existingInvoice) {
      throw AppError.conflict(
        `Faktur pembelian dengan nomor "${input.invoiceNumber}" sudah pernah dicatat sebelumnya.`,
      )
    }

    // Sort product IDs to guarantee consistent lock ordering
    const sortedItems = [...input.items].sort((a, b) => a.productId - b.productId)
    const nowIso = new Date().toISOString()

    return runInImmediateTransaction(this.deps.db, () => {
      let subtotalAmount = 0
      const resolvedItems: Array<{
        productId: number
        skuSnapshot: string
        productNameSnapshot: string
        unitSnapshot: string
        qty: number
        unitCost: number
        lineSubtotal: number
        expiryDate: string | null
      }> = []

      for (const item of sortedItems) {
        const product = this.deps.productRepo.findById(item.productId)
        if (!product) {
          throw AppError.notFound(`Produk dengan ID #${item.productId} tidak ditemukan.`)
        }
        if (!product.isActive) {
          throw AppError.badRequest(
            `Produk "${product.name}" (${product.sku}) diarsipkan dan tidak dapat menerima restock pembelian.`,
          )
        }

        const lineSubtotal = item.qty * item.unitCost
        subtotalAmount += lineSubtotal

        resolvedItems.push({
          productId: product.id,
          skuSnapshot: product.sku,
          productNameSnapshot: product.name,
          unitSnapshot: product.unit,
          qty: item.qty,
          unitCost: item.unitCost,
          lineSubtotal,
          expiryDate: item.expiryDate ?? null,
        })
      }

      const purchaseId = this.deps.purchaseRepo.createPurchaseRecord({
        invoiceNumber: input.invoiceNumber,
        supplierId: input.supplierId,
        receiverUserId: actor.id,
        subtotalAmount,
        paymentStatus: input.paymentStatus,
        dueDate: input.dueDate ?? null,
        notes: input.notes ?? null,
        nowIso,
        items: resolvedItems,
      })

      // Update the stock ledger and corresponding batch in the same transaction.
      for (const item of sortedItems) {
        const product = this.deps.productRepo.findById(item.productId)
        if (!product) {
          throw new Error(
            `Invariant violation: missing product #${item.productId} during purchase ledger execution.`,
          )
        }

        this.deps.inventoryService.recordPurchaseStockInTx({
          product,
          qty: item.qty,
          unitCost: item.unitCost,
          purchaseId,
          invoiceNumber: `${input.invoiceNumber} (${supplier.name})`,
          expiryDate: item.expiryDate ?? null,
          actorUserId: actor.id,
          nowIso,
        })
      }

      const created = this.deps.purchaseRepo.findDetailById(purchaseId)
      if (!created) {
        throw new Error(`Faktur pembelian #${purchaseId} gagal dibaca setelah pembuatan.`)
      }
      return created
    })
  }

  public listPurchases(query: PurchasesQueryInput): PaginatedResult<PurchaseSummaryDTO> {
    return this.deps.purchaseRepo.listPaginated(query)
  }

  public getPayablesSummary(today: string): PurchasePayablesSummaryDTO {
    return this.deps.purchaseRepo.getPayablesSummary(today)
  }

  public getReplenishmentRecommendations(supplierId?: number) {
    return this.deps.replenishmentRepo.getRecommendations({
      supplierId,
      now: new Date(),
    })
  }

  public getPurchaseDetail(id: number): PurchaseDetailDTO {
    const detail = this.deps.purchaseRepo.findDetailById(id)
    if (!detail) {
      throw AppError.notFound(`Faktur pembelian dengan ID #${id} tidak ditemukan.`)
    }
    return detail
  }

  public updatePaymentStatus(
    id: number,
    input: UpdatePurchasePaymentStatusInput,
  ): PurchaseDetailDTO {
    const existing = this.deps.purchaseRepo.findDetailById(id)
    if (!existing) {
      throw AppError.notFound(`Faktur pembelian dengan ID #${id} tidak ditemukan.`)
    }

    runInImmediateTransaction(this.deps.db, () => {
      const ok = this.deps.purchaseRepo.updatePaymentStatus(
        id,
        input.paymentStatus,
        input.notes ?? null,
      )
      if (!ok) {
        throw AppError.notFound(
          `Faktur pembelian #${id} tidak ditemukan saat pembaruan status pembayaran.`,
        )
      }
    })

    const updated = this.deps.purchaseRepo.findDetailById(id)
    if (!updated) {
      throw new Error(`Faktur pembelian #${id} gagal dibaca setelah pembaruan.`)
    }
    return updated
  }
}
