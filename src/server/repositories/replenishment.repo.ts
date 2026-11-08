import type { DatabaseSync } from 'node:sqlite'
import type { ReplenishmentRecommendationDTO } from '../../shared/types.js'

interface ProductSalesRow {
  product_id: number
  sku: string
  product_name: string
  unit: string
  stock_qty: number
  min_stock_qty: number
  sold_qty: number
}

export class ReplenishmentRepository {
  private readonly db: DatabaseSync

  public constructor(db: DatabaseSync) {
    this.db = db
  }

  public getRecommendations(params: {
    supplierId?: number
    now: Date
  }): readonly ReplenishmentRecommendationDTO[] {
    const supplier =
      params.supplierId === undefined
        ? undefined
        : (this.db
            .prepare(
              'SELECT id, name, lead_time_days FROM suppliers WHERE id = ? AND is_active = 1',
            )
            .get(params.supplierId) as
            | { id: number; name: string; lead_time_days: number }
            | undefined)
    if (params.supplierId !== undefined && !supplier) return []

    const since = new Date(params.now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const rows = this.db
      .prepare(`
        SELECT p.id AS product_id, p.sku, p.name AS product_name, p.unit,
          COALESCE((
            SELECT SUM(b.qty_remaining)
            FROM stock_batches b
            WHERE b.product_id = p.id AND b.qty_remaining > 0
              AND (b.expiry_date IS NULL OR b.expiry_date >= date('now', 'localtime'))
          ), 0) AS stock_qty,
          p.min_stock_qty,
          COALESCE(SUM(CASE WHEN s.id IS NOT NULL THEN si.qty ELSE 0 END), 0) AS sold_qty
        FROM products p
        LEFT JOIN sale_items si ON si.product_id = p.id
        LEFT JOIN sales s ON s.id = si.sale_id
          AND s.status = 'COMPLETED' AND s.created_at >= ?
        WHERE p.is_active = 1
        GROUP BY p.id
        ORDER BY p.name COLLATE NOCASE ASC, p.id ASC
      `)
      .all(since) as unknown as ProductSalesRow[]

    const leadTimeDays = supplier?.lead_time_days ?? 7
    return rows
      .map((row) => {
        const avgDailySales = row.sold_qty / 30
        const recommendedQty = Math.max(
          0,
          Math.ceil(row.min_stock_qty + avgDailySales * leadTimeDays - row.stock_qty),
        )
        return {
          productId: row.product_id,
          sku: row.sku,
          productName: row.product_name,
          unit: row.unit,
          stockQty: row.stock_qty,
          minStockQty: row.min_stock_qty,
          avgDailySales,
          recommendedQty,
          leadTimeDays,
          supplierId: supplier?.id ?? null,
          supplierName: supplier?.name ?? null,
        }
      })
      .filter((recommendation) => recommendation.recommendedQty > 0)
  }
}
