import type { DatabaseSync, SQLInputValue, StatementSync } from 'node:sqlite'
import type { MovementReferenceType, MovementType } from '../../shared/constants.js'
import type { MovementQueryInput } from '../../shared/schemas/index.js'
import type { PaginatedResult, StockMovementDTO } from '../../shared/types.js'
import { AppError } from '../errors/app-error.js'
import {
  buildPaginationMeta,
  dateFilterToUtcEndIso,
  dateFilterToUtcStartIso,
} from './sqlite-helpers.js'

interface RawMovementRow {
  id: number
  product_id: number
  product_sku: string
  product_name: string
  product_unit: string
  movement_type: MovementType
  qty_before: number
  qty_change: number
  qty_after: number
  unit_cost_snapshot: number | null
  reference_type: MovementReferenceType
  reference_id: number | null
  note: string | null
  actor_user_id: number
  actor_name: string
  created_at: string
}

function mapMovementRow(row: RawMovementRow, includeUnitCost: boolean): StockMovementDTO {
  return {
    id: row.id,
    productId: row.product_id,
    productSku: row.product_sku,
    productName: row.product_name,
    productUnit: row.product_unit,
    movementType: row.movement_type,
    qtyBefore: row.qty_before,
    qtyChange: row.qty_change,
    qtyAfter: row.qty_after,
    unitCostSnapshot: includeUnitCost ? row.unit_cost_snapshot : null,
    referenceType: row.reference_type,
    referenceId: row.reference_id,
    note: row.note,
    actorUserId: row.actor_user_id,
    actorName: row.actor_name,
    createdAt: row.created_at,
  }
}

const BASE_MOVEMENT_SELECT = `
  SELECT
    sm.id,
    sm.product_id,
    p.sku AS product_sku,
    p.name AS product_name,
    p.unit AS product_unit,
    sm.movement_type,
    sm.qty_before,
    sm.qty_change,
    sm.qty_after,
    sm.unit_cost_snapshot,
    sm.reference_type,
    sm.reference_id,
    sm.note,
    sm.actor_user_id,
    u.full_name AS actor_name,
    sm.created_at
  FROM stock_movements sm
  INNER JOIN products p ON p.id = sm.product_id
  INNER JOIN users u ON u.id = sm.actor_user_id
`

export class StockMovementRepository {
  private readonly db: DatabaseSync
  private readonly stmtUpdateProductStockOnly: StatementSync
  private readonly stmtUpdateProductStockAndCost: StatementSync
  private readonly stmtInsertMovement: StatementSync
  private readonly stmtFindById: StatementSync

  public constructor(db: DatabaseSync) {
    this.db = db
    this.stmtUpdateProductStockOnly = db.prepare(`
      UPDATE products
      SET stock_qty = ?, updated_at = ?
      WHERE id = ? AND stock_qty = ?
    `)
    this.stmtUpdateProductStockAndCost = db.prepare(`
      UPDATE products
      SET stock_qty = ?, cost_price = ?, updated_at = ?
      WHERE id = ? AND stock_qty = ?
    `)
    this.stmtInsertMovement = db.prepare(`
      INSERT INTO stock_movements (
        product_id,
        movement_type,
        qty_before,
        qty_change,
        qty_after,
        unit_cost_snapshot,
        reference_type,
        reference_id,
        note,
        actor_user_id,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    this.stmtFindById = db.prepare(`${BASE_MOVEMENT_SELECT} WHERE sm.id = ?`)
  }

  /**
   * Single Source of Truth (SSOT) stock mutator.
   * Must be called inside `runInImmediateTransaction`.
   */
  public applyMovementAtomically(params: {
    productId: number
    movementType: MovementType
    qtyBefore: number
    qtyChange: number
    qtyAfter: number
    unitCostSnapshot: number | null
    newProductCostPrice?: number
    referenceType: MovementReferenceType
    referenceId: number | null
    note: string | null
    actorUserId: number
    nowIso: string
    includeUnitCostInResult: boolean
  }): StockMovementDTO {
    const updateRes =
      params.newProductCostPrice !== undefined
        ? this.stmtUpdateProductStockAndCost.run(
            params.qtyAfter,
            params.newProductCostPrice,
            params.nowIso,
            params.productId,
            params.qtyBefore,
          )
        : this.stmtUpdateProductStockOnly.run(
            params.qtyAfter,
            params.nowIso,
            params.productId,
            params.qtyBefore,
          )

    if (Number(updateRes.changes) !== 1) {
      throw AppError.conflict(
        'Saldo stok berubah secara bersamaan. Silakan muat ulang dan ulangi transaksi.',
      )
    }

    const insertRes = this.stmtInsertMovement.run(
      params.productId,
      params.movementType,
      params.qtyBefore,
      params.qtyChange,
      params.qtyAfter,
      params.unitCostSnapshot,
      params.referenceType,
      params.referenceId,
      params.note,
      params.actorUserId,
      params.nowIso,
    )

    const insertedRow = this.stmtFindById.get(Number(insertRes.lastInsertRowid)) as
      | RawMovementRow
      | undefined

    if (!insertedRow) {
      throw new Error('Failed to load newly recorded stock movement.')
    }

    return mapMovementRow(insertedRow, params.includeUnitCostInResult)
  }

  public listPaginated(
    query: MovementQueryInput,
    includeUnitCost: boolean,
  ): PaginatedResult<StockMovementDTO> {
    const conditions: string[] = []
    const params: SQLInputValue[] = []

    if (query.productId !== undefined) {
      conditions.push('sm.product_id = ?')
      params.push(query.productId)
    }

    if (query.movementType !== undefined) {
      conditions.push('sm.movement_type = ?')
      params.push(query.movementType)
    }

    if (query.dateFrom !== undefined) {
      conditions.push('sm.created_at >= ?')
      params.push(dateFilterToUtcStartIso(query.dateFrom))
    }

    if (query.dateTo !== undefined) {
      conditions.push('sm.created_at <= ?')
      params.push(dateFilterToUtcEndIso(query.dateTo))
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const countRow = this.db
      .prepare(`SELECT COUNT(*) AS total FROM stock_movements sm ${whereClause}`)
      .get(...params) as { total: number } | undefined
    const totalItems = countRow?.total ?? 0

    const offset = (query.page - 1) * query.pageSize
    const rows = this.db
      .prepare(`
        ${BASE_MOVEMENT_SELECT}
        ${whereClause}
        ORDER BY sm.created_at DESC, sm.id DESC
        LIMIT ? OFFSET ?
      `)
      .all(...params, query.pageSize, offset) as unknown as RawMovementRow[]

    return {
      items: rows.map((row) => mapMovementRow(row, includeUnitCost)),
      meta: buildPaginationMeta(query.page, query.pageSize, totalItems),
    }
  }
}
