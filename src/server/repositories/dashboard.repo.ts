import type { DatabaseSync, StatementSync } from 'node:sqlite'
import type {
  DailySalesPointDTO,
  DashboardMetricsDTO,
  ProductDTO,
  SaleSummaryDTO,
  TopProductMetricDTO,
} from '../../shared/types.js'
import { toProductDTO } from './product.repo.js'

interface RawInventoryStatsRow {
  total_active: number
  low_stock_count: number
  out_of_stock_count: number
  total_cost_value: number
  total_retail_value: number
}

interface RawPeriodSalesStatsRow {
  revenue_amount: number
  transaction_count: number
  gross_profit_amount: number
}

function formatLocalYmd(date: Date): string {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export class DashboardRepository {
  private readonly stmtInventorySummary: StatementSync
  private readonly stmtPeriodSalesStats: StatementSync
  private readonly stmtSalesWithinWindow: StatementSync
  private readonly stmtTopProductsInWindow: StatementSync
  private readonly stmtLowStockProducts: StatementSync

  public constructor(db: DatabaseSync) {
    this.stmtInventorySummary = db.prepare(`
      SELECT
        COUNT(*) AS total_active,
        COALESCE(SUM(CASE WHEN stock_qty <= min_stock_qty THEN 1 ELSE 0 END), 0) AS low_stock_count,
        COALESCE(SUM(CASE WHEN stock_qty = 0 THEN 1 ELSE 0 END), 0) AS out_of_stock_count,
        COALESCE(SUM(stock_qty * cost_price), 0) AS total_cost_value,
        COALESCE(SUM(stock_qty * sell_price), 0) AS total_retail_value
      FROM products
      WHERE is_active = 1
    `)

    this.stmtPeriodSalesStats = db.prepare(`
      SELECT
        COALESCE(SUM(s.total_amount), 0) AS revenue_amount,
        COUNT(s.id) AS transaction_count,
        COALESCE(SUM(COALESCE(item_agg.margin, 0) - s.discount_amount), 0) AS gross_profit_amount
      FROM sales s
      LEFT JOIN (
        SELECT
          sale_id,
          SUM((sell_price_at_sale - cost_price_at_sale) * qty) AS margin
        FROM sale_items
        GROUP BY sale_id
      ) item_agg ON item_agg.sale_id = s.id
      WHERE s.status = 'COMPLETED'
        AND s.created_at >= ?
        AND s.created_at <= ?
    `)

    this.stmtSalesWithinWindow = db.prepare(`
      SELECT
        s.created_at,
        s.total_amount,
        (COALESCE(item_agg.margin, 0) - s.discount_amount) AS gross_profit
      FROM sales s
      LEFT JOIN (
        SELECT
          sale_id,
          SUM((sell_price_at_sale - cost_price_at_sale) * qty) AS margin
        FROM sale_items
        GROUP BY sale_id
      ) item_agg ON item_agg.sale_id = s.id
      WHERE s.status = 'COMPLETED'
        AND s.created_at >= ?
        AND s.created_at <= ?
      ORDER BY s.created_at ASC
    `)

    this.stmtTopProductsInWindow = db.prepare(`
      SELECT
        si.product_id,
        p.sku,
        p.name,
        p.unit,
        SUM(si.qty) AS sold_qty,
        SUM(si.line_subtotal) AS revenue_amount
      FROM sale_items si
      INNER JOIN sales s ON s.id = si.sale_id
      INNER JOIN products p ON p.id = si.product_id
      WHERE s.status = 'COMPLETED'
        AND s.created_at >= ?
        AND s.created_at <= ?
      GROUP BY si.product_id
      ORDER BY sold_qty DESC, revenue_amount DESC
      LIMIT 5
    `)

    this.stmtLowStockProducts = db.prepare(`
      SELECT
        p.id,
        p.sku,
        p.barcode,
        p.name,
        p.category_id,
        c.name AS category_name,
        p.unit,
        p.cost_price,
        p.sell_price,
        p.stock_qty,
        p.min_stock_qty,
        p.is_active,
        p.created_at,
        p.updated_at
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.is_active = 1
        AND p.stock_qty <= p.min_stock_qty
      ORDER BY p.stock_qty ASC, (p.min_stock_qty - p.stock_qty) DESC, p.id ASC
      LIMIT 8
    `)
  }

  public getMetrics(params: {
    days: number
    includeFinancials: boolean
    recentSales: readonly SaleSummaryDTO[]
    now?: Date
  }): DashboardMetricsDTO {
    const now = params.now ?? new Date()

    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      0,
      0,
      0,
      0,
    )
    const todayEnd = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59,
      999,
    )

    const windowStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - (params.days - 1),
      0,
      0,
      0,
      0,
    )

    const invStats = this.stmtInventorySummary.get() as unknown as RawInventoryStatsRow
    const todayStats = this.stmtPeriodSalesStats.get(
      todayStart.toISOString(),
      todayEnd.toISOString(),
    ) as unknown as RawPeriodSalesStatsRow

    const trendMap = new Map<string, { revenue: number; count: number; profit: number }>()
    for (let i = 0; i < params.days; i += 1) {
      const dayDate = new Date(
        windowStart.getFullYear(),
        windowStart.getMonth(),
        windowStart.getDate() + i,
      )
      trendMap.set(formatLocalYmd(dayDate), { revenue: 0, count: 0, profit: 0 })
    }

    const windowRows = this.stmtSalesWithinWindow.all(
      windowStart.toISOString(),
      todayEnd.toISOString(),
    ) as Array<{
      created_at: string
      total_amount: number
      gross_profit: number
    }>

    for (const row of windowRows) {
      const localKey = formatLocalYmd(new Date(row.created_at))
      const bucket = trendMap.get(localKey)
      if (bucket) {
        bucket.revenue += row.total_amount
        bucket.count += 1
        bucket.profit += row.gross_profit
      }
    }

    const salesTrend: DailySalesPointDTO[] = Array.from(trendMap.entries()).map(
      ([date, val]) => ({
        date,
        revenueAmount: val.revenue,
        transactionCount: val.count,
        grossProfitAmount: params.includeFinancials ? val.profit : null,
      }),
    )

    const topProductRows = this.stmtTopProductsInWindow.all(
      windowStart.toISOString(),
      todayEnd.toISOString(),
    ) as Array<{
      product_id: number
      sku: string
      name: string
      unit: string
      sold_qty: number
      revenue_amount: number
    }>

    const topProducts: TopProductMetricDTO[] = topProductRows.map((r) => ({
      productId: r.product_id,
      sku: r.sku,
      name: r.name,
      unit: r.unit,
      soldQty: r.sold_qty,
      revenueAmount: r.revenue_amount,
    }))

    const lowStockRaw = this.stmtLowStockProducts.all() as Array<{
      id: number
      sku: string
      barcode: string | null
      name: string
      category_id: number | null
      category_name: string | null
      unit: string
      cost_price: number
      sell_price: number
      stock_qty: number
      min_stock_qty: number
      is_active: number
      created_at: string
      updated_at: string
    }>

    const lowStockProducts: ProductDTO[] = lowStockRaw.map((row) =>
      toProductDTO(
        {
          id: row.id,
          sku: row.sku,
          barcode: row.barcode,
          name: row.name,
          categoryId: row.category_id,
          categoryName: row.category_name,
          unit: row.unit,
          costPrice: row.cost_price,
          sellPrice: row.sell_price,
          stockQty: row.stock_qty,
          minStockQty: row.min_stock_qty,
          isActive: row.is_active === 1,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        },
        params.includeFinancials,
      ),
    )

    return {
      todayRevenueAmount: todayStats.revenue_amount,
      todayTransactionCount: todayStats.transaction_count,
      todayGrossProfitAmount: params.includeFinancials
        ? todayStats.gross_profit_amount
        : null,
      totalActiveProducts: invStats.total_active,
      lowStockCount: invStats.low_stock_count,
      outOfStockCount: invStats.out_of_stock_count,
      totalInventoryCostValue: params.includeFinancials
        ? invStats.total_cost_value
        : null,
      totalInventoryRetailValue: invStats.total_retail_value,
      salesTrend,
      lowStockProducts,
      topProducts,
      recentSales: params.recentSales,
    }
  }
}
