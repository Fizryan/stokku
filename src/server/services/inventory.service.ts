import type { DatabaseSync } from 'node:sqlite'
import { hasPermission } from '../../shared/constants.js'
import type {
  MovementQueryInput,
  RecordStockMovementInput,
} from '../../shared/schemas/index.js'
import type { PaginatedResult, StockMovementDTO, UserDTO } from '../../shared/types.js'
import type { InventoryServiceContract } from '../contracts/services.contract.js'
import { runInImmediateTransaction } from '../db/transaction.js'
import { AppError } from '../errors/app-error.js'
import type { ProductRecord, ProductRepository } from '../repositories/product.repo.js'
import type { StockMovementRepository } from '../repositories/stock-movement.repo.js'

export interface InventoryServiceDeps {
  readonly db: DatabaseSync
  readonly productRepo: ProductRepository
  readonly stockMovementRepo: StockMovementRepository
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

    return this.deps.stockMovementRepo.applyMovementAtomically({
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

    const qtyAfter = params.product.stockQty - params.qty
    return this.deps.stockMovementRepo.applyMovementAtomically({
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
    return this.deps.stockMovementRepo.applyMovementAtomically({
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
  }

  public recordManualMovement(
    actor: UserDTO,
    input: RecordStockMovementInput,
  ): StockMovementDTO {
    const nowIso = new Date().toISOString()
    const includeCost = this.canSeeCost(actor)

    return runInImmediateTransaction(this.deps.db, () => {
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

        const weightedAvgCost =
          input.unitCost !== undefined
            ? qtyBefore > 0
              ? Math.round(
                  (qtyBefore * product.costPrice + qtyChange * incomingCost) / qtyAfter,
                )
              : incomingCost
            : undefined

        return this.deps.stockMovementRepo.applyMovementAtomically({
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

        return this.deps.stockMovementRepo.applyMovementAtomically({
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
      }

      const qtyBefore = product.stockQty
      const qtyAfter = input.actualStockQty
      const qtyChange = qtyAfter - qtyBefore

      if (qtyChange === 0) {
        throw AppError.badRequest(
          'Stok fisik aktual sama dengan stok sistem saat ini (tidak ada selisih untuk disesuaikan).',
        )
      }

      return this.deps.stockMovementRepo.applyMovementAtomically({
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
    })
  }

  public listMovements(
    actor: UserDTO,
    query: MovementQueryInput,
  ): PaginatedResult<StockMovementDTO> {
    return this.deps.stockMovementRepo.listPaginated(query, this.canSeeCost(actor))
  }
}
