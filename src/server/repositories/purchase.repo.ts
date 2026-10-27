import type { DatabaseSync, SQLInputValue, StatementSync } from 'node:sqlite'
import type { PurchasePaymentStatus } from '../../shared/constants.js'
import type { PurchasesQueryInput } from '../../shared/schemas/index.js'
import type {
  PaginatedResult,
  PurchaseDetailDTO,
  PurchaseItemDTO,
  PurchaseSummaryDTO,
} from '../../shared/types.js'
import {
  buildPaginationMeta,
  dateFilterToUtcEndIso,
  dateFilterToUtcStartIso,
  escapeSqlLikePattern,
  rethrowUniqueAsConflict,
} from './sqlite-helpers.js'

interface RawPurchaseSummaryRow {
  id: number
  invoice_number: string
  supplier_id: number
  supplier_name: string
  receiver_user_id: number
  receiver_name: string
  subtotal_amount: number
  payment_status: PurchasePaymentStatus
  due_date: string | null
  notes: string | null
  created_at: string
  item_count: number
  total_qty: number
}

interface RawPurchaseItemRow {
  id: number
  purchase_id: number
  product_id: number
  sku_snapshot: string
  product_name_snapshot: string
  unit_snapshot: string
  qty: number
  unit_cost: number
  line_subtotal: number
}

function mapSummaryRow(row: RawPurchaseSummaryRow): PurchaseSummaryDTO {
  return {
    id: row.id,
    invoiceNumber: row.invoice_number,
    supplierId: row.supplier_id,
    supplierName: row.supplier_name,
    receiverUserId: row.receiver_user_id,
    receiverName: row.receiver_name,
    subtotalAmount: row.subtotal_amount,
    paymentStatus: row.payment_status,
    dueDate: row.due_date,
    notes: row.notes,
    itemCount: row.item_count,
    totalQty: row.total_qty,
    createdAt: row.created_at,
  }
}

function mapItemRow(row: RawPurchaseItemRow): PurchaseItemDTO {
  return {
    id: row.id,
    purchaseId: row.purchase_id,
    productId: row.product_id,
    skuSnapshot: row.sku_snapshot,
    productNameSnapshot: row.product_name_snapshot,
    unitSnapshot: row.unit_snapshot,
    qty: row.qty,
    unitCost: row.unit_cost,
    lineSubtotal: row.line_subtotal,
  }
}

export class PurchaseRepository {
  private readonly db: DatabaseSync
  private readonly stmtInsertPurchase: StatementSync
  private readonly stmtInsertItem: StatementSync
  private readonly stmtFindHeaderById: StatementSync
  private readonly stmtFindItemsByPurchaseId: StatementSync
  private readonly stmtFindByInvoiceNumber: StatementSync
  private readonly stmtUpdatePaymentStatus: StatementSync

  public constructor(db: DatabaseSync) {
    this.db = db

    this.stmtInsertPurchase = db.prepare(`
      INSERT INTO purchases (
        invoice_number,
        supplier_id,
        receiver_user_id,
        subtotal_amount,
        payment_status,
        due_date,
        notes,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)

    this.stmtInsertItem = db.prepare(`
      INSERT INTO purchase_items (
        purchase_id,
        product_id,
        sku_snapshot,
        product_name_snapshot,
        unit_snapshot,
        qty,
        unit_cost,
        line_subtotal
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)

    this.stmtFindHeaderById = db.prepare(`
      SELECT
        p.id,
        p.invoice_number,
        p.supplier_id,
        s.name AS supplier_name,
        p.receiver_user_id,
        u.full_name AS receiver_name,
        p.subtotal_amount,
        p.payment_status,
        p.due_date,
        p.notes,
        p.created_at,
        COALESCE(agg.item_count, 0) AS item_count,
        COALESCE(agg.total_qty, 0) AS total_qty
      FROM purchases p
      INNER JOIN suppliers s ON s.id = p.supplier_id
      INNER JOIN users u ON u.id = p.receiver_user_id
      LEFT JOIN (
        SELECT
          purchase_id,
          COUNT(*) AS item_count,
          SUM(qty) AS total_qty
        FROM purchase_items
        WHERE purchase_id = ?
        GROUP BY purchase_id
      ) agg ON agg.purchase_id = p.id
      WHERE p.id = ?
    `)

    this.stmtFindItemsByPurchaseId = db.prepare(`
      SELECT
        id,
        purchase_id,
        product_id,
        sku_snapshot,
        product_name_snapshot,
        unit_snapshot,
        qty,
        unit_cost,
        line_subtotal
      FROM purchase_items
      WHERE purchase_id = ?
      ORDER BY id ASC
    `)

    this.stmtFindByInvoiceNumber = db.prepare(`
      SELECT
        p.id,
        p.invoice_number,
        p.supplier_id,
        s.name AS supplier_name,
        p.receiver_user_id,
        u.full_name AS receiver_name,
        p.subtotal_amount,
        p.payment_status,
        p.due_date,
        p.notes,
        p.created_at,
        COALESCE(agg.item_count, 0) AS item_count,
        COALESCE(agg.total_qty, 0) AS total_qty
      FROM purchases p
      INNER JOIN suppliers s ON s.id = p.supplier_id
      INNER JOIN users u ON u.id = p.receiver_user_id
      LEFT JOIN (
        SELECT
          purchase_id,
          COUNT(*) AS item_count,
          SUM(qty) AS total_qty
        FROM purchase_items
        GROUP BY purchase_id
      ) agg ON agg.purchase_id = p.id
      WHERE p.invoice_number = ?
    `)

    this.stmtUpdatePaymentStatus = db.prepare(`
      UPDATE purchases
      SET
        payment_status = ?,
        notes = COALESCE(?, notes)
      WHERE id = ?
    `)
  }

  public createPurchaseRecord(params: {
    invoiceNumber: string
    supplierId: number
    receiverUserId: number
    subtotalAmount: number
    paymentStatus: PurchasePaymentStatus
    dueDate: string | null
    notes: string | null
    nowIso: string
    items: ReadonlyArray<{
      productId: number
      skuSnapshot: string
      productNameSnapshot: string
      unitSnapshot: string
      qty: number
      unitCost: number
      lineSubtotal: number
    }>
  }): number {
    let purchaseId: number
    try {
      const headerRes = this.stmtInsertPurchase.run(
        params.invoiceNumber,
        params.supplierId,
        params.receiverUserId,
        params.subtotalAmount,
        params.paymentStatus,
        params.dueDate,
        params.notes,
        params.nowIso,
      )
      purchaseId = Number(headerRes.lastInsertRowid)
    } catch (err) {
      rethrowUniqueAsConflict(
        err,
        `Faktur pembelian dengan nomor "${params.invoiceNumber}" sudah pernah dicatat sebelumnya.`,
        {
          invoice_number: `Faktur pembelian dengan nomor "${params.invoiceNumber}" sudah pernah dicatat sebelumnya.`,
        },
      )
    }

    for (const item of params.items) {
      this.stmtInsertItem.run(
        purchaseId,
        item.productId,
        item.skuSnapshot,
        item.productNameSnapshot,
        item.unitSnapshot,
        item.qty,
        item.unitCost,
        item.lineSubtotal,
      )
    }

    return purchaseId
  }

  public findDetailById(purchaseId: number): PurchaseDetailDTO | undefined {
    const headerRow = this.stmtFindHeaderById.get(purchaseId, purchaseId) as
      | RawPurchaseSummaryRow
      | undefined
    if (!headerRow) return undefined

    const itemRows = this.stmtFindItemsByPurchaseId.all(
      purchaseId,
    ) as unknown as RawPurchaseItemRow[]

    return {
      ...mapSummaryRow(headerRow),
      items: itemRows.map(mapItemRow),
    }
  }

  public findByInvoiceNumber(invoiceNumber: string): PurchaseSummaryDTO | undefined {
    const row = this.stmtFindByInvoiceNumber.get(invoiceNumber) as
      | RawPurchaseSummaryRow
      | undefined
    return row ? mapSummaryRow(row) : undefined
  }

  public updatePaymentStatus(
    purchaseId: number,
    paymentStatus: PurchasePaymentStatus,
    notes?: string | null,
  ): boolean {
    const res = this.stmtUpdatePaymentStatus.run(paymentStatus, notes ?? null, purchaseId)
    return Number(res.changes) === 1
  }

  public listPaginated(query: PurchasesQueryInput): PaginatedResult<PurchaseSummaryDTO> {
    const conditions: string[] = []
    const params: SQLInputValue[] = []

    if (query.supplierId !== undefined) {
      conditions.push('p.supplier_id = ?')
      params.push(query.supplierId)
    }

    if (query.paymentStatus) {
      conditions.push('p.payment_status = ?')
      params.push(query.paymentStatus)
    }

    if (query.search) {
      const escaped = `%${escapeSqlLikePattern(query.search)}%`
      conditions.push(
        "(p.invoice_number LIKE ? ESCAPE '\\' OR s.name LIKE ? ESCAPE '\\')",
      )
      params.push(escaped, escaped)
    }

    if (query.dateFrom) {
      conditions.push('p.created_at >= ?')
      params.push(dateFilterToUtcStartIso(query.dateFrom))
    }

    if (query.dateTo) {
      conditions.push('p.created_at <= ?')
      params.push(dateFilterToUtcEndIso(query.dateTo))
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const countRow = this.db
      .prepare(
        `SELECT COUNT(*) AS total
         FROM purchases p
         INNER JOIN suppliers s ON s.id = p.supplier_id
         ${whereClause}`,
      )
      .get(...params) as { total: number } | undefined
    const totalItems = countRow?.total ?? 0

    const offset = (query.page - 1) * query.pageSize
    const rows = this.db
      .prepare(`
        WITH page_purchases AS (
          SELECT p.*
          FROM purchases p
          INNER JOIN suppliers s ON s.id = p.supplier_id
          ${whereClause}
          ORDER BY p.created_at DESC, p.id DESC
          LIMIT ? OFFSET ?
        )
        SELECT
          pp.id,
          pp.invoice_number,
          pp.supplier_id,
          s.name AS supplier_name,
          pp.receiver_user_id,
          u.full_name AS receiver_name,
          pp.subtotal_amount,
          pp.payment_status,
          pp.due_date,
          pp.notes,
          pp.created_at,
          COALESCE(agg.item_count, 0) AS item_count,
          COALESCE(agg.total_qty, 0) AS total_qty
        FROM page_purchases pp
        INNER JOIN suppliers s ON s.id = pp.supplier_id
        INNER JOIN users u ON u.id = pp.receiver_user_id
        LEFT JOIN (
          SELECT
            purchase_id,
            COUNT(*) AS item_count,
            SUM(qty) AS total_qty
          FROM purchase_items
          WHERE purchase_id IN (SELECT id FROM page_purchases)
          GROUP BY purchase_id
        ) agg ON agg.purchase_id = pp.id
        ORDER BY pp.created_at DESC, pp.id DESC
      `)
      .all(...params, query.pageSize, offset) as unknown as RawPurchaseSummaryRow[]

    return {
      items: rows.map(mapSummaryRow),
      meta: buildPaginationMeta(query.page, query.pageSize, totalItems),
    }
  }
}
