import type { DatabaseSync, SQLInputValue, StatementSync } from 'node:sqlite'
import type { PaymentMethod, SaleStatus } from '../../shared/constants.js'
import type {
  SalesExportQueryInput,
  SalesQueryInput,
} from '../../shared/schemas/index.js'
import type {
  PaginatedResult,
  SaleDetailDTO,
  SaleItemDTO,
  SaleSummaryDTO,
} from '../../shared/types.js'
import {
  buildPaginationMeta,
  dateFilterToUtcEndIso,
  dateFilterToUtcStartIso,
  escapeSqlLikePattern,
} from './sqlite-helpers.js'

interface RawSaleSummaryRow {
  id: number
  invoice_number: string
  cashier_user_id: number
  cashier_name: string
  customer_name: string | null
  subtotal_amount: number
  discount_amount: number
  total_amount: number
  payment_method: PaymentMethod
  paid_amount: number
  change_amount: number
  status: SaleStatus
  void_reason: string | null
  voided_by_name: string | null
  voided_at: string | null
  created_at: string
  item_count: number
  total_qty: number
  gross_margin_before_discount: number
}

interface RawSaleItemRow {
  id: number
  sale_id: number
  product_id: number
  sku_snapshot: string
  product_name_snapshot: string
  unit_snapshot: string
  qty: number
  cost_price_at_sale: number
  sell_price_at_sale: number
  line_subtotal: number
}

export interface CsvExportSaleRow {
  readonly invoiceNumber: string
  readonly createdAt: string
  readonly status: SaleStatus
  readonly cashierName: string
  readonly customerName: string | null
  readonly paymentMethod: PaymentMethod
  readonly itemCount: number
  readonly totalQty: number
  readonly subtotalAmount: number
  readonly discountAmount: number
  readonly totalAmount: number
  readonly grossProfitAmount: number
  readonly voidReason: string | null
}

function mapSummaryRow(
  row: RawSaleSummaryRow,
  includeFinancials: boolean,
): SaleSummaryDTO {
  const grossProfit =
    row.status === 'COMPLETED'
      ? row.gross_margin_before_discount - row.discount_amount
      : 0

  return {
    id: row.id,
    invoiceNumber: row.invoice_number,
    cashierUserId: row.cashier_user_id,
    cashierName: row.cashier_name,
    customerName: row.customer_name,
    itemCount: row.item_count,
    totalQty: row.total_qty,
    subtotalAmount: row.subtotal_amount,
    discountAmount: row.discount_amount,
    totalAmount: row.total_amount,
    grossProfitAmount: includeFinancials ? grossProfit : null,
    paymentMethod: row.payment_method,
    paidAmount: row.paid_amount,
    changeAmount: row.change_amount,
    status: row.status,
    voidReason: row.void_reason,
    voidedByName: row.voided_by_name,
    voidedAt: row.voided_at,
    createdAt: row.created_at,
  }
}

function mapItemRow(row: RawSaleItemRow, includeFinancials: boolean): SaleItemDTO {
  return {
    id: row.id,
    saleId: row.sale_id,
    productId: row.product_id,
    skuSnapshot: row.sku_snapshot,
    productNameSnapshot: row.product_name_snapshot,
    unitSnapshot: row.unit_snapshot,
    qty: row.qty,
    costPriceAtSale: includeFinancials ? row.cost_price_at_sale : null,
    sellPriceAtSale: row.sell_price_at_sale,
    lineSubtotal: row.line_subtotal,
  }
}

export class SaleRepository {
  private readonly db: DatabaseSync
  private readonly stmtLatestInvoiceByPrefix: StatementSync
  private readonly stmtInsertSale: StatementSync
  private readonly stmtInsertSaleItem: StatementSync
  private readonly stmtFindHeaderById: StatementSync
  private readonly stmtFindItemsBySaleId: StatementSync
  private readonly stmtMarkVoided: StatementSync

  public constructor(db: DatabaseSync) {
    this.db = db
    this.stmtLatestInvoiceByPrefix = db.prepare(`
      SELECT invoice_number
      FROM sales
      WHERE invoice_number >= ? AND invoice_number < ?
      ORDER BY invoice_number DESC
      LIMIT 1
    `)
    this.stmtInsertSale = db.prepare(`
      INSERT INTO sales (
        invoice_number,
        cashier_user_id,
        customer_name,
        subtotal_amount,
        discount_amount,
        total_amount,
        payment_method,
        paid_amount,
        change_amount,
        status,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED', ?)
    `)
    this.stmtInsertSaleItem = db.prepare(`
      INSERT INTO sale_items (
        sale_id,
        product_id,
        sku_snapshot,
        product_name_snapshot,
        unit_snapshot,
        qty,
        cost_price_at_sale,
        sell_price_at_sale,
        line_subtotal
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    this.stmtFindHeaderById = db.prepare(`
      SELECT
        s.id,
        s.invoice_number,
        s.cashier_user_id,
        u.full_name AS cashier_name,
        s.customer_name,
        s.subtotal_amount,
        s.discount_amount,
        s.total_amount,
        s.payment_method,
        s.paid_amount,
        s.change_amount,
        s.status,
        s.void_reason,
        vu.full_name AS voided_by_name,
        s.voided_at,
        s.created_at,
        COALESCE(agg.item_count, 0) AS item_count,
        COALESCE(agg.total_qty, 0) AS total_qty,
        COALESCE(agg.gross_margin_before_discount, 0) AS gross_margin_before_discount
      FROM sales s
      INNER JOIN users u ON u.id = s.cashier_user_id
      LEFT JOIN users vu ON vu.id = s.voided_by_user_id
      LEFT JOIN (
        SELECT
          sale_id,
          COUNT(*) AS item_count,
          SUM(qty) AS total_qty,
          SUM((sell_price_at_sale - cost_price_at_sale) * qty) AS gross_margin_before_discount
        FROM sale_items
        WHERE sale_id = ?
        GROUP BY sale_id
      ) agg ON agg.sale_id = s.id
      WHERE s.id = ?
    `)
    this.stmtFindItemsBySaleId = db.prepare(`
      SELECT
        id,
        sale_id,
        product_id,
        sku_snapshot,
        product_name_snapshot,
        unit_snapshot,
        qty,
        cost_price_at_sale,
        sell_price_at_sale,
        line_subtotal
      FROM sale_items
      WHERE sale_id = ?
      ORDER BY id ASC
    `)
    this.stmtMarkVoided = db.prepare(`
      UPDATE sales
      SET
        status = 'VOIDED',
        void_reason = ?,
        voided_by_user_id = ?,
        voided_at = ?
      WHERE id = ? AND status = 'COMPLETED'
    `)
  }

  public generateNextInvoiceNumber(now: Date): string {
    const yyyy = String(now.getFullYear())
    const mm = String(now.getMonth() + 1).padStart(2, '0')
    const dd = String(now.getDate()).padStart(2, '0')
    const prefix = `INV-${yyyy}${mm}${dd}-`
    const upperBound = `INV-${yyyy}${mm}${dd}.`

    const latest = this.stmtLatestInvoiceByPrefix.get(prefix, upperBound) as
      | { invoice_number: string }
      | undefined

    let nextSeq = 1
    if (latest) {
      const suffix = latest.invoice_number.slice(prefix.length)
      const parsed = Number.parseInt(suffix, 10)
      if (Number.isInteger(parsed) && parsed >= 1) {
        nextSeq = parsed + 1
      }
    }

    return `${prefix}${String(nextSeq).padStart(4, '0')}`
  }

  public createSaleRecord(params: {
    invoiceNumber: string
    cashierUserId: number
    customerName: string | null
    subtotalAmount: number
    discountAmount: number
    totalAmount: number
    paymentMethod: PaymentMethod
    paidAmount: number
    changeAmount: number
    nowIso: string
    items: ReadonlyArray<{
      productId: number
      skuSnapshot: string
      productNameSnapshot: string
      unitSnapshot: string
      qty: number
      costPriceAtSale: number
      sellPriceAtSale: number
      lineSubtotal: number
    }>
  }): number {
    const headerRes = this.stmtInsertSale.run(
      params.invoiceNumber,
      params.cashierUserId,
      params.customerName,
      params.subtotalAmount,
      params.discountAmount,
      params.totalAmount,
      params.paymentMethod,
      params.paidAmount,
      params.changeAmount,
      params.nowIso,
    )
    const saleId = Number(headerRes.lastInsertRowid)

    for (const item of params.items) {
      this.stmtInsertSaleItem.run(
        saleId,
        item.productId,
        item.skuSnapshot,
        item.productNameSnapshot,
        item.unitSnapshot,
        item.qty,
        item.costPriceAtSale,
        item.sellPriceAtSale,
        item.lineSubtotal,
      )
    }

    return saleId
  }

  public findDetailById(
    saleId: number,
    includeFinancials: boolean,
  ): SaleDetailDTO | undefined {
    const headerRow = this.stmtFindHeaderById.get(saleId, saleId) as
      | RawSaleSummaryRow
      | undefined
    if (!headerRow) return undefined

    const itemRows = this.stmtFindItemsBySaleId.all(saleId) as unknown as RawSaleItemRow[]

    return {
      ...mapSummaryRow(headerRow, includeFinancials),
      items: itemRows.map((row) => mapItemRow(row, includeFinancials)),
    }
  }

  /**
   * Internal lookup returning raw item quantities for atomic void stock restoration.
   */
  public findRawItemsForVoid(
    saleId: number,
  ): ReadonlyArray<{ productId: number; qty: number }> {
    const rows = this.stmtFindItemsBySaleId.all(saleId) as unknown as RawSaleItemRow[]
    return rows.map((r) => ({ productId: r.product_id, qty: r.qty }))
  }

  public markSaleVoided(params: {
    saleId: number
    reason: string
    voidedByUserId: number
    nowIso: string
  }): boolean {
    const res = this.stmtMarkVoided.run(
      params.reason,
      params.voidedByUserId,
      params.nowIso,
      params.saleId,
    )
    return Number(res.changes) === 1
  }

  private buildFilterClause(
    filter: SalesExportQueryInput,
    restrictToCashierId?: number,
  ): { whereClause: string; params: SQLInputValue[] } {
    const conditions: string[] = []
    const params: SQLInputValue[] = []

    if (restrictToCashierId !== undefined) {
      conditions.push('s.cashier_user_id = ?')
      params.push(restrictToCashierId)
    }

    if (filter.status !== undefined) {
      conditions.push('s.status = ?')
      params.push(filter.status)
    }

    if (filter.paymentMethod !== undefined) {
      conditions.push('s.payment_method = ?')
      params.push(filter.paymentMethod)
    }

    if (filter.dateFrom !== undefined) {
      conditions.push('s.created_at >= ?')
      params.push(dateFilterToUtcStartIso(filter.dateFrom))
    }

    if (filter.dateTo !== undefined) {
      conditions.push('s.created_at <= ?')
      params.push(dateFilterToUtcEndIso(filter.dateTo))
    }

    if (filter.search) {
      const escaped = `%${escapeSqlLikePattern(filter.search)}%`
      conditions.push(
        "(s.invoice_number LIKE ? ESCAPE '\\' OR COALESCE(s.customer_name, '') LIKE ? ESCAPE '\\')",
      )
      params.push(escaped.toUpperCase(), escaped)
    }

    return {
      whereClause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
      params,
    }
  }

  public listPaginated(
    query: SalesQueryInput,
    options: {
      includeFinancials: boolean
      restrictToCashierId?: number
    },
  ): PaginatedResult<SaleSummaryDTO> {
    const { whereClause, params } = this.buildFilterClause(
      query,
      options.restrictToCashierId,
    )

    const countRow = this.db
      .prepare(`SELECT COUNT(*) AS total FROM sales s ${whereClause}`)
      .get(...params) as { total: number } | undefined
    const totalItems = countRow?.total ?? 0

    const offset = (query.page - 1) * query.pageSize
    const rows = this.db
      .prepare(`
        WITH page_sales AS (
          SELECT s.*
          FROM sales s
          ${whereClause}
          ORDER BY s.created_at DESC, s.id DESC
          LIMIT ? OFFSET ?
        )
        SELECT
          ps.*,
          u.full_name AS cashier_name,
          vu.full_name AS voided_by_name,
          COALESCE(agg.item_count, 0) AS item_count,
          COALESCE(agg.total_qty, 0) AS total_qty,
          COALESCE(agg.gross_margin_before_discount, 0) AS gross_margin_before_discount
        FROM page_sales ps
        INNER JOIN users u ON u.id = ps.cashier_user_id
        LEFT JOIN users vu ON vu.id = ps.voided_by_user_id
        LEFT JOIN (
          SELECT
            si.sale_id,
            COUNT(*) AS item_count,
            SUM(si.qty) AS total_qty,
            SUM((si.sell_price_at_sale - si.cost_price_at_sale) * si.qty) AS gross_margin_before_discount
          FROM sale_items si
          WHERE si.sale_id IN (SELECT id FROM page_sales)
          GROUP BY si.sale_id
        ) agg ON agg.sale_id = ps.id
        ORDER BY ps.created_at DESC, ps.id DESC
      `)
      .all(...params, query.pageSize, offset) as unknown as RawSaleSummaryRow[]

    return {
      items: rows.map((r) => mapSummaryRow(r, options.includeFinancials)),
      meta: buildPaginationMeta(query.page, query.pageSize, totalItems),
    }
  }

  public *iterateForExport(
    filter: SalesExportQueryInput,
  ): Generator<CsvExportSaleRow, void, unknown> {
    const { whereClause, params } = this.buildFilterClause(filter)
    const stmt = this.db.prepare(`
      SELECT
        s.invoice_number,
        s.created_at,
        s.status,
        u.full_name AS cashier_name,
        s.customer_name,
        s.payment_method,
        s.subtotal_amount,
        s.discount_amount,
        s.total_amount,
        s.void_reason,
        COALESCE(agg.item_count, 0) AS item_count,
        COALESCE(agg.total_qty, 0) AS total_qty,
        COALESCE(agg.gross_margin_before_discount, 0) AS gross_margin_before_discount
      FROM sales s
      INNER JOIN users u ON u.id = s.cashier_user_id
      LEFT JOIN (
        SELECT
          sale_id,
          COUNT(*) AS item_count,
          SUM(qty) AS total_qty,
          SUM((sell_price_at_sale - cost_price_at_sale) * qty) AS gross_margin_before_discount
        FROM sale_items
        GROUP BY sale_id
      ) agg ON agg.sale_id = s.id
      ${whereClause}
      ORDER BY s.created_at DESC, s.id DESC
    `)

    for (const raw of stmt.iterate(...params)) {
      const row = raw as unknown as RawSaleSummaryRow
      const grossProfit =
        row.status === 'COMPLETED'
          ? row.gross_margin_before_discount - row.discount_amount
          : 0

      yield {
        invoiceNumber: row.invoice_number,
        createdAt: row.created_at,
        status: row.status,
        cashierName: row.cashier_name,
        customerName: row.customer_name,
        paymentMethod: row.payment_method,
        itemCount: row.item_count,
        totalQty: row.total_qty,
        subtotalAmount: row.subtotal_amount,
        discountAmount: row.discount_amount,
        totalAmount: row.total_amount,
        grossProfitAmount: grossProfit,
        voidReason: row.void_reason,
      }
    }
  }
}
