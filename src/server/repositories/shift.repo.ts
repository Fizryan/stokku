import type { DatabaseSync, SQLInputValue, StatementSync } from 'node:sqlite'
import type { ShiftMovementType, ShiftStatus } from '../../shared/constants.js'
import type { ShiftsQueryInput } from '../../shared/schemas/index.js'
import type {
  CashShiftDetailDTO,
  CashShiftMovementDTO,
  CashShiftSummaryDTO,
  PaginatedResult,
} from '../../shared/types.js'
import {
  buildPaginationMeta,
  dateFilterToUtcEndIso,
  dateFilterToUtcStartIso,
} from './sqlite-helpers.js'

interface RawShiftHeaderRow {
  id: number
  cashier_user_id: number
  cashier_name: string
  opened_at: string
  closed_at: string | null
  opening_cash: number
  closing_cash: number | null
  expected_cash: number | null
  cash_difference: number | null
  status: ShiftStatus
  notes: string | null
  created_at: string
  total_cash_sales: number
  total_non_cash_sales: number
  transaction_count: number
  total_cash_in: number
  total_cash_out: number
}

interface RawMovementRow {
  id: number
  shift_id: number
  movement_type: ShiftMovementType
  amount: number
  reason: string
  actor_user_id: number
  actor_name: string
  created_at: string
}

function mapShiftRow(row: RawShiftHeaderRow): CashShiftSummaryDTO {
  const calculatedExpectedCash =
    row.status === 'CLOSED' && row.expected_cash !== null
      ? row.expected_cash
      : row.opening_cash + row.total_cash_sales + row.total_cash_in - row.total_cash_out

  return {
    id: row.id,
    cashierUserId: row.cashier_user_id,
    cashierName: row.cashier_name,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    openingCash: row.opening_cash,
    closingCash: row.closing_cash,
    expectedCash: calculatedExpectedCash,
    cashDifference: row.cash_difference,
    status: row.status,
    notes: row.notes,
    totalCashSales: row.total_cash_sales,
    totalNonCashSales: row.total_non_cash_sales,
    totalCashIn: row.total_cash_in,
    totalCashOut: row.total_cash_out,
    transactionCount: row.transaction_count,
    createdAt: row.created_at,
  }
}

function mapMovementRow(row: RawMovementRow): CashShiftMovementDTO {
  return {
    id: row.id,
    shiftId: row.shift_id,
    movementType: row.movement_type,
    amount: row.amount,
    reason: row.reason,
    actorUserId: row.actor_user_id,
    actorName: row.actor_name,
    createdAt: row.created_at,
  }
}

export class ShiftRepository {
  private readonly db: DatabaseSync
  private readonly stmtInsertShift: StatementSync
  private readonly stmtInsertMovement: StatementSync
  private readonly stmtFindActiveShiftIdByCashier: StatementSync
  private readonly stmtFindHeaderById: StatementSync
  private readonly stmtFindMovementsByShiftId: StatementSync
  private readonly stmtCloseShift: StatementSync

  public constructor(db: DatabaseSync) {
    this.db = db

    this.stmtInsertShift = db.prepare(`
      INSERT INTO cash_shifts (
        cashier_user_id,
        opened_at,
        opening_cash,
        status,
        notes,
        created_at
      )
      VALUES (?, ?, ?, 'OPEN', ?, ?)
    `)

    this.stmtInsertMovement = db.prepare(`
      INSERT INTO cash_shift_movements (
        shift_id,
        movement_type,
        amount,
        reason,
        actor_user_id,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `)

    this.stmtFindActiveShiftIdByCashier = db.prepare(`
      SELECT id
      FROM cash_shifts
      WHERE cashier_user_id = ? AND status = 'OPEN'
      ORDER BY id DESC
      LIMIT 1
    `)

    this.stmtFindHeaderById = db.prepare(`
      SELECT
        cs.id,
        cs.cashier_user_id,
        u.full_name AS cashier_name,
        cs.opened_at,
        cs.closed_at,
        cs.opening_cash,
        cs.closing_cash,
        cs.expected_cash,
        cs.cash_difference,
        cs.status,
        cs.notes,
        cs.created_at,
        COALESCE(sales_agg.total_cash_sales, 0) AS total_cash_sales,
        COALESCE(sales_agg.total_non_cash_sales, 0) AS total_non_cash_sales,
        COALESCE(sales_agg.transaction_count, 0) AS transaction_count,
        COALESCE(mov_agg.total_cash_in, 0) AS total_cash_in,
        COALESCE(mov_agg.total_cash_out, 0) AS total_cash_out
      FROM cash_shifts cs
      INNER JOIN users u ON u.id = cs.cashier_user_id
      LEFT JOIN (
        SELECT
          shift_id,
          SUM(CASE WHEN payment_method = 'CASH' THEN total_amount ELSE 0 END) AS total_cash_sales,
          SUM(CASE WHEN payment_method != 'CASH' THEN total_amount ELSE 0 END) AS total_non_cash_sales,
          COUNT(*) AS transaction_count
        FROM sales
        WHERE shift_id = ? AND status = 'COMPLETED'
        GROUP BY shift_id
      ) sales_agg ON sales_agg.shift_id = cs.id
      LEFT JOIN (
        SELECT
          shift_id,
          SUM(CASE WHEN movement_type = 'CASH_IN' THEN amount ELSE 0 END) AS total_cash_in,
          SUM(CASE WHEN movement_type = 'CASH_OUT' THEN amount ELSE 0 END) AS total_cash_out
        FROM cash_shift_movements
        WHERE shift_id = ?
        GROUP BY shift_id
      ) mov_agg ON mov_agg.shift_id = cs.id
      WHERE cs.id = ?
    `)

    this.stmtFindMovementsByShiftId = db.prepare(`
      SELECT
        m.id,
        m.shift_id,
        m.movement_type,
        m.amount,
        m.reason,
        m.actor_user_id,
        u.full_name AS actor_name,
        m.created_at
      FROM cash_shift_movements m
      INNER JOIN users u ON u.id = m.actor_user_id
      WHERE m.shift_id = ?
      ORDER BY m.created_at ASC, m.id ASC
    `)

    this.stmtCloseShift = db.prepare(`
      UPDATE cash_shifts
      SET
        status = 'CLOSED',
        closing_cash = ?,
        expected_cash = ?,
        cash_difference = ?,
        notes = ?,
        closed_at = ?
      WHERE id = ? AND status = 'OPEN'
    `)
  }

  public openShift(params: {
    cashierUserId: number
    openingCash: number
    notes: string | null
    openedAtIso: string
  }): number {
    const res = this.stmtInsertShift.run(
      params.cashierUserId,
      params.openedAtIso,
      params.openingCash,
      params.notes,
      params.openedAtIso,
    )
    return Number(res.lastInsertRowid)
  }

  public findActiveByCashierId(cashierUserId: number): CashShiftDetailDTO | undefined {
    const row = this.stmtFindActiveShiftIdByCashier.get(cashierUserId) as
      | { id: number }
      | undefined
    if (!row) return undefined
    return this.findById(row.id)
  }

  public findById(shiftId: number): CashShiftDetailDTO | undefined {
    const headerRow = this.stmtFindHeaderById.get(shiftId, shiftId, shiftId) as
      | RawShiftHeaderRow
      | undefined
    if (!headerRow) return undefined

    const movementRows = this.stmtFindMovementsByShiftId.all(
      shiftId,
    ) as unknown as RawMovementRow[]

    return {
      ...mapShiftRow(headerRow),
      movements: movementRows.map(mapMovementRow),
    }
  }

  public recordCashMovement(params: {
    shiftId: number
    movementType: ShiftMovementType
    amount: number
    reason: string
    actorUserId: number
    createdAtIso: string
  }): number {
    const res = this.stmtInsertMovement.run(
      params.shiftId,
      params.movementType,
      params.amount,
      params.reason,
      params.actorUserId,
      params.createdAtIso,
    )
    return Number(res.lastInsertRowid)
  }

  public closeShift(params: {
    shiftId: number
    closingCash: number
    expectedCash: number
    cashDifference: number
    notes: string | null
    closedAtIso: string
  }): boolean {
    const res = this.stmtCloseShift.run(
      params.closingCash,
      params.expectedCash,
      params.cashDifference,
      params.notes,
      params.closedAtIso,
      params.shiftId,
    )
    return Number(res.changes) === 1
  }

  private buildFilterClause(
    filter: ShiftsQueryInput,
    restrictToCashierId?: number,
  ): { whereClause: string; params: SQLInputValue[] } {
    const conditions: string[] = []
    const params: SQLInputValue[] = []

    if (restrictToCashierId !== undefined) {
      conditions.push('cs.cashier_user_id = ?')
      params.push(restrictToCashierId)
    } else if (filter.cashierUserId !== undefined) {
      conditions.push('cs.cashier_user_id = ?')
      params.push(filter.cashierUserId)
    }

    if (filter.status) {
      conditions.push('cs.status = ?')
      params.push(filter.status)
    }

    if (filter.dateFrom) {
      conditions.push('cs.opened_at >= ?')
      params.push(dateFilterToUtcStartIso(filter.dateFrom))
    }

    if (filter.dateTo) {
      conditions.push('cs.opened_at <= ?')
      params.push(dateFilterToUtcEndIso(filter.dateTo))
    }

    return {
      whereClause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
      params,
    }
  }

  public listPaginated(
    query: ShiftsQueryInput,
    options: {
      restrictToCashierId?: number
    } = {},
  ): PaginatedResult<CashShiftSummaryDTO> {
    const { whereClause, params } = this.buildFilterClause(
      query,
      options.restrictToCashierId,
    )

    const countRow = this.db
      .prepare(`SELECT COUNT(*) AS total FROM cash_shifts cs ${whereClause}`)
      .get(...params) as { total: number } | undefined
    const totalItems = countRow?.total ?? 0

    const offset = (query.page - 1) * query.pageSize
    const rows = this.db
      .prepare(`
        WITH page_shifts AS (
          SELECT cs.*
          FROM cash_shifts cs
          ${whereClause}
          ORDER BY cs.opened_at DESC, cs.id DESC
          LIMIT ? OFFSET ?
        )
        SELECT
          ps.*,
          u.full_name AS cashier_name,
          COALESCE(sales_agg.total_cash_sales, 0) AS total_cash_sales,
          COALESCE(sales_agg.total_non_cash_sales, 0) AS total_non_cash_sales,
          COALESCE(sales_agg.transaction_count, 0) AS transaction_count,
          COALESCE(mov_agg.total_cash_in, 0) AS total_cash_in,
          COALESCE(mov_agg.total_cash_out, 0) AS total_cash_out
        FROM page_shifts ps
        INNER JOIN users u ON u.id = ps.cashier_user_id
        LEFT JOIN (
          SELECT
            shift_id,
            SUM(CASE WHEN payment_method = 'CASH' THEN total_amount ELSE 0 END) AS total_cash_sales,
            SUM(CASE WHEN payment_method != 'CASH' THEN total_amount ELSE 0 END) AS total_non_cash_sales,
            COUNT(*) AS transaction_count
          FROM sales
          WHERE status = 'COMPLETED' AND shift_id IN (SELECT id FROM page_shifts)
          GROUP BY shift_id
        ) sales_agg ON sales_agg.shift_id = ps.id
        LEFT JOIN (
          SELECT
            shift_id,
            SUM(CASE WHEN movement_type = 'CASH_IN' THEN amount ELSE 0 END) AS total_cash_in,
            SUM(CASE WHEN movement_type = 'CASH_OUT' THEN amount ELSE 0 END) AS total_cash_out
          FROM cash_shift_movements
          WHERE shift_id IN (SELECT id FROM page_shifts)
          GROUP BY shift_id
        ) mov_agg ON mov_agg.shift_id = ps.id
        ORDER BY ps.opened_at DESC, ps.id DESC
      `)
      .all(...params, query.pageSize, offset) as unknown as RawShiftHeaderRow[]

    return {
      items: rows.map(mapShiftRow),
      meta: buildPaginationMeta(query.page, query.pageSize, totalItems),
    }
  }
}
