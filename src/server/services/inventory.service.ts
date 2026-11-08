import type { DatabaseSync } from 'node:sqlite'
import { hasPermission } from '../../shared/constants.js'
import type {
  MovementQueryInput,
  RecordStockMovementInput,
} from '../../shared/schemas/index.js'
import type { PaginatedResult, StockMovementDTO, UserDTO } from '../../shared/types.js'
import type {
  AuditServiceContract,
  InventoryServiceContract,
} from '../contracts/services.contract.js'
import { runInImmediateTransaction } from '../db/transaction.js'
import { AppError } from '../errors/app-error.js'
import type { ProductRecord, ProductRepository } from '../repositories/product.repo.js'
import type { StockBatchRepository } from '../repositories/stock-batch.repo.js'
import type { StockMovementRepository } from '../repositories/stock-movement.repo.js'

export interface InventoryServiceDeps {
  readonly db: DatabaseSync
  readonly productRepo: ProductRepository
  readonly stockMovementRepo: StockMovementRepository
  readonly stockBatchRepo: StockBatchRepository
  readonly auditService?: AuditServiceContract
}

export class InventoryService implements InventoryServiceContract {
  private readonly deps: InventoryServiceDeps

  public constructor(deps: InventoryServiceDeps) {
    this.deps = deps
  }

  private canSeeCost(actor: UserDTO): boolean {
    return (
      hasPermission(actor.role, 'inventory:manage') ||
      hasPermission(actor.role, 'dashboard:financials')
    )
  }

  /**
   * Internal SSOT mutator for initial product stock inside an active transaction.
   */
  public recordInitialStockInTx(params: {
    product: ProductRecord
    initialStock: number
    actorUserId: number
    nowIso: string
    includeUnitCostInResult: boolean
  }): StockMovementDTO | null {
    if (params.initialStock <= 0) {
      return null
    }

    const movement = this.deps.stockMovementRepo.applyMovementAtomically({
      productId: params.product.id,
      movementType: 'INITIAL',
      qtyBefore: 0,
      qtyChange: params.initialStock,
      qtyAfter: params.initialStock,
      unitCostSnapshot: params.product.costPrice,
      referenceType: 'INITIAL',
      referenceId: params.product.id,
      note: 'Saldo stok awal saat pendaftaran produk',
      actorUserId: params.actorUserId,
      nowIso: params.nowIso,
      includeUnitCostInResult: params.includeUnitCostInResult,
    })
    this.deps.stockBatchRepo.addBatch({
      productId: params.product.id,
      sourceType: 'INITIAL',
      sourceId: params.product.id,
      qty: params.initialStock,
      expiryDate: null,
      unitCost: params.product.costPrice,
      createdAt: params.nowIso,
    })
    return movement
  }

  public listExpiringStock(withinDays = 30) {
    return this.deps.stockBatchRepo.listExpiring(withinDays, new Date().toISOString())
  }

  public recordPurchaseStockInTx(params: {
    product: ProductRecord
    qty: number
    unitCost: number
    purchaseId: number
    invoiceNumber: string
    expiryDate: string | null
    actorUserId: number
    nowIso: string
  }): StockMovementDTO {
    const qtyAfter = params.product.stockQty + params.qty
    const weightedAvgCost =
      params.product.stockQty > 0
        ? Math.round(
            (params.product.stockQty * params.product.costPrice +
              params.qty * params.unitCost) /
              qtyAfter,
          )
        : params.unitCost
    const movement = this.deps.stockMovementRepo.applyMovementAtomically({
      productId: params.product.id,
      movementType: 'IN_PURCHASE',
      qtyBefore: params.product.stockQty,
      qtyChange: params.qty,
      qtyAfter,
      unitCostSnapshot: params.unitCost,
      newProductCostPrice: weightedAvgCost,
      referenceType: 'MANUAL',
      referenceId: params.purchaseId,
      note: `Faktur Pembelian: ${params.invoiceNumber}`,
      actorUserId: params.actorUserId,
      nowIso: params.nowIso,
      includeUnitCostInResult: true,
    })
    this.deps.stockBatchRepo.addBatch({
      productId: params.product.id,
      sourceType: 'PURCHASE',
      sourceId: params.purchaseId,
      qty: params.qty,
      expiryDate: params.expiryDate,
      unitCost: params.unitCost,
      createdAt: params.nowIso,
    })
    return movement
  }

  /**
   * Internal SSOT mutator for POS sales deduction inside an active transaction.
   */
  public deductStockForSaleItemInTx(params: {
    product: ProductRecord
    qty: number
    saleId: number
    invoiceNumber: string
    actorUserId: number
    nowIso: string
  }): StockMovementDTO {
    if (params.product.stockQty < params.qty) {
      throw AppError.insufficientStock(
        `Stok produk "${params.product.name}" (${params.product.sku}) tidak mencukupi. Tersisa ${params.product.stockQty} ${params.product.unit}, diminta ${params.qty} ${params.product.unit}.`,
      )
    }
    const sellableQty = this.deps.stockBatchRepo.getSellableQty(params.product.id)
    if (sellableQty < params.qty) {
      throw AppError.insufficientStock(
        `Stok produk "${params.product.name}" (${params.product.sku}) yang belum kedaluwarsa tidak mencukupi. Tersedia ${sellableQty} ${params.product.unit}, diminta ${params.qty} ${params.product.unit}.`,
      )
    }

    const qtyAfter = params.product.stockQty - params.qty
    const movement = this.deps.stockMovementRepo.applyMovementAtomically({
      productId: params.product.id,
      movementType: 'OUT_SALE',
      qtyBefore: params.product.stockQty,
      qtyChange: -params.qty,
      qtyAfter,
      unitCostSnapshot: params.product.costPrice,
      referenceType: 'SALE',
      referenceId: params.saleId,
      note: `Penjualan ${params.invoiceNumber}`,
      actorUserId: params.actorUserId,
      nowIso: params.nowIso,
      includeUnitCostInResult: false,
    })
    this.deps.stockBatchRepo.consume({
      productId: params.product.id,
      qty: params.qty,
      saleId: params.saleId,
    })
    return movement
  }

  /**
   * Internal SSOT mutator for Void Sale reversal inside an active transaction.
   */
  public restoreStockForVoidItemInTx(params: {
    product: ProductRecord
    qty: number
    saleId: number
    invoiceNumber: string
    actorUserId: number
    nowIso: string
  }): StockMovementDTO {
    const qtyAfter = params.product.stockQty + params.qty
    const movement = this.deps.stockMovementRepo.applyMovementAtomically({
      productId: params.product.id,
      movementType: 'VOID_REVERSAL',
      qtyBefore: params.product.stockQty,
      qtyChange: params.qty,
      qtyAfter,
      unitCostSnapshot: params.product.costPrice,
      referenceType: 'VOID',
      referenceId: params.saleId,
      note: `Pembatalan transaksi ${params.invoiceNumber}`,
      actorUserId: params.actorUserId,
      nowIso: params.nowIso,
      includeUnitCostInResult: true,
    })
    const restoredQty = this.deps.stockBatchRepo.restoreSaleAllocations(
      params.saleId,
      params.product.id,
    )
    if (restoredQty < params.qty) {
      this.deps.stockBatchRepo.addBatch({
        productId: params.product.id,
        sourceType: 'LEGACY',
        sourceId: params.saleId,
        qty: params.qty - restoredQty,
        expiryDate: null,
        unitCost: params.product.costPrice,
        createdAt: params.nowIso,
      })
    }
    return movement
  }

  public recordManualMovement(
    actor: UserDTO,
    input: RecordStockMovementInput,
  ): StockMovementDTO {
    const nowIso = new Date().toISOString()
    const includeCost = this.canSeeCost(actor)

    const movement = runInImmediateTransaction(this.deps.db, () => {
      const product = this.deps.productRepo.findById(input.productId)
      if (!product) {
        throw AppError.notFound('Produk tidak ditemukan.')
      }
      if (!product.isActive) {
        throw AppError.badRequest(
          'Produk yang diarsipkan tidak dapat menerima mutasi stok. Aktifkan produk terlebih dahulu.',
        )
      }

      if (input.movementType === 'IN_PURCHASE') {
        const qtyBefore = product.stockQty
        const qtyChange = input.quantity
        const qtyAfter = qtyBefore + qtyChange
        const incomingCost = input.unitCost ?? product.costPrice

        let weightedAvgCost: number | undefined
        if (input.unitCost !== undefined) {
          weightedAvgCost =
            qtyBefore > 0
              ? Math.round(
                  (qtyBefore * product.costPrice + qtyChange * incomingCost) / qtyAfter,
                )
              : incomingCost
        }

        const movement = this.deps.stockMovementRepo.applyMovementAtomically({
          productId: product.id,
          movementType: 'IN_PURCHASE',
          qtyBefore,
          qtyChange,
          qtyAfter,
          unitCostSnapshot: incomingCost,
          newProductCostPrice: weightedAvgCost,
          referenceType: 'MANUAL',
          referenceId: null,
          note: input.note ?? 'Penambahan stok masuk (Restock)',
          actorUserId: actor.id,
          nowIso,
          includeUnitCostInResult: includeCost,
        })
        this.deps.stockBatchRepo.addBatch({
          productId: product.id,
          sourceType: 'MANUAL',
          sourceId: null,
          qty: input.quantity,
          expiryDate: null,
          unitCost: incomingCost,
          createdAt: nowIso,
        })
        return movement
      }

      if (input.movementType === 'OUT_DAMAGED') {
        if (product.stockQty < input.quantity) {
          throw AppError.insufficientStock(
            `Jumlah pengurangan (${input.quantity} ${product.unit}) melebihi stok saat ini (${product.stockQty} ${product.unit}).`,
          )
        }
        const qtyBefore = product.stockQty
        const qtyChange = -input.quantity
        const qtyAfter = qtyBefore + qtyChange

        const movement = this.deps.stockMovementRepo.applyMovementAtomically({
          productId: product.id,
          movementType: 'OUT_DAMAGED',
          qtyBefore,
          qtyChange,
          qtyAfter,
          unitCostSnapshot: product.costPrice,
          referenceType: 'MANUAL',
          referenceId: null,
          note: input.note,
          actorUserId: actor.id,
          nowIso,
          includeUnitCostInResult: includeCost,
        })
        this.deps.stockBatchRepo.consume({
          productId: product.id,
          qty: input.quantity,
        })
        return movement
      }

      const qtyBefore = product.stockQty
      const qtyAfter = input.actualStockQty
      const qtyChange = qtyAfter - qtyBefore

      if (qtyChange === 0) {
        throw AppError.badRequest(
          'Stok fisik aktual sama dengan stok sistem saat ini (tidak ada selisih untuk disesuaikan).',
        )
      }

      const movement = this.deps.stockMovementRepo.applyMovementAtomically({
        productId: product.id,
        movementType: 'ADJUSTMENT_OPNAME',
        qtyBefore,
        qtyChange,
        qtyAfter,
        unitCostSnapshot: product.costPrice,
        referenceType: 'MANUAL',
        referenceId: null,
        note: input.note,
        actorUserId: actor.id,
        nowIso,
        includeUnitCostInResult: includeCost,
      })
      if (qtyChange < 0) {
        this.deps.stockBatchRepo.consume({
          productId: product.id,
          qty: -qtyChange,
        })
      } else {
        this.deps.stockBatchRepo.addBatch({
          productId: product.id,
          sourceType: 'MANUAL',
          sourceId: null,
          qty: qtyChange,
          expiryDate: null,
          unitCost: product.costPrice,
          createdAt: nowIso,
        })
      }
      return movement
    })

    if (this.deps.auditService) {
      this.deps.auditService.log({
        actor,
        actionType: 'STOCK_ADJUSTED',
        resourceType: 'product',
        resourceId: movement.productId,
        details: {
          productId: movement.productId,
          sku: movement.productSku,
          name: movement.productName,
          movementType: movement.movementType,
          qtyBefore: movement.qtyBefore,
          qtyChange: movement.qtyChange,
          qtyAfter: movement.qtyAfter,
          note: movement.note,
        },
      })
    }

    return movement
  }

  public listMovements(
    actor: UserDTO,
    query: MovementQueryInput,
  ): PaginatedResult<StockMovementDTO> {
    return this.deps.stockMovementRepo.listPaginated(query, this.canSeeCost(actor))
  }
}
