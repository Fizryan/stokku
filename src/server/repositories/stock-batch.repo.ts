import type { DatabaseSync } from 'node:sqlite'

export interface StockBatchAllocation {
  readonly batchId: number
  readonly qty: number
}

interface BatchRow {
  id: number
  qty_remaining: number
}

export class StockBatchRepository {
  private readonly db: DatabaseSync

  public constructor(db: DatabaseSync) {
    this.db = db
  }

  public addBatch(params: {
    productId: number
    sourceType: 'LEGACY' | 'INITIAL' | 'PURCHASE' | 'MANUAL'
    sourceId: number | null
    qty: number
    expiryDate: string | null
    unitCost: number
    createdAt: string
  }): void {
    if (params.qty <= 0) return
    this.db
      .prepare(`
        INSERT INTO stock_batches (
          product_id, source_type, source_id, qty_received, qty_remaining,
          expiry_date, unit_cost, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        params.productId,
        params.sourceType,
        params.sourceId,
        params.qty,
        params.qty,
        params.expiryDate,
        params.unitCost,
        params.createdAt,
      )
  }

  public consume(params: {
    productId: number
    qty: number
    saleId?: number
  }): readonly StockBatchAllocation[] {
    const batches = this.db
      .prepare(`
        SELECT id, qty_remaining
        FROM stock_batches
        WHERE product_id = ? AND qty_remaining > 0
          AND (? = 0 OR expiry_date IS NULL OR expiry_date >= date('now', 'localtime'))
        ORDER BY CASE WHEN expiry_date IS NULL THEN 1 ELSE 0 END,
          expiry_date ASC, created_at ASC, id ASC
      `)
      .all(params.productId, params.saleId === undefined ? 0 : 1) as unknown as BatchRow[]

    let remaining = params.qty
    const allocations: StockBatchAllocation[] = []
    for (const batch of batches) {
      if (remaining === 0) break
      const allocated = Math.min(remaining, batch.qty_remaining)
      this.db
        .prepare(
          'UPDATE stock_batches SET qty_remaining = qty_remaining - ? WHERE id = ?',
        )
        .run(allocated, batch.id)
      if (params.saleId !== undefined) {
        this.db
          .prepare(`
            INSERT INTO sale_batch_allocations (sale_id, batch_id, qty)
            VALUES (?, ?, ?)
          `)
          .run(params.saleId, batch.id, allocated)
      }

      allocations.push({ batchId: batch.id, qty: allocated })
      remaining -= allocated
    }

    if (remaining > 0) {
      throw new Error(
        `Stock batch invariant violated for product #${params.productId}: ${remaining} units unallocated.`,
      )
    }
    return allocations
  }

  public getSellableQty(productId: number): number {
    const row = this.db
      .prepare(`
        SELECT COALESCE(SUM(qty_remaining), 0) AS qty
        FROM stock_batches
        WHERE product_id = ? AND qty_remaining > 0
          AND (expiry_date IS NULL OR expiry_date >= date('now', 'localtime'))
      `)
      .get(productId) as { qty: number } | undefined
    return row?.qty ?? 0
  }

  public restoreSaleAllocations(saleId: number, productId: number): number {
    const allocations = this.db
      .prepare(`
        SELECT a.batch_id, a.qty
        FROM sale_batch_allocations a
        INNER JOIN stock_batches b ON b.id = a.batch_id
        WHERE a.sale_id = ? AND b.product_id = ?
      `)
      .all(saleId, productId) as unknown as Array<{ batch_id: number; qty: number }>
    for (const allocation of allocations) {
      this.db
        .prepare(
          'UPDATE stock_batches SET qty_remaining = qty_remaining + ? WHERE id = ?',
        )
        .run(allocation.qty, allocation.batch_id)
    }
    return allocations.reduce((sum, allocation) => sum + allocation.qty, 0)
  }

  public listExpiring(
    withinDays: number,
    nowIso: string,
  ): Array<{
    productId: number
    sku: string
    productName: string
    unit: string
    qty: number
    expiryDate: string
    daysUntilExpiry: number
  }> {
    return this.db
      .prepare(`
        SELECT b.product_id AS productId, p.sku, p.name AS productName, p.unit,
          SUM(b.qty_remaining) AS qty, b.expiry_date AS expiryDate,
          CAST(julianday(b.expiry_date) - julianday(date(?, 'localtime')) AS INTEGER) AS daysUntilExpiry
        FROM stock_batches b
        INNER JOIN products p ON p.id = b.product_id
        WHERE p.is_active = 1 AND b.qty_remaining > 0
          AND b.expiry_date IS NOT NULL
          AND b.expiry_date <= date(?, 'localtime', '+' || ? || ' days')
        GROUP BY b.product_id, b.expiry_date
        ORDER BY b.expiry_date ASC, p.name ASC
      `)
      .all(nowIso, nowIso, withinDays) as Array<{
      productId: number
      sku: string
      productName: string
      unit: string
      qty: number
      expiryDate: string
      daysUntilExpiry: number
    }>
  }
}
