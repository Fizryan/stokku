import type { DatabaseSync, SQLInputValue, StatementSync } from 'node:sqlite'
import type { ProductQueryInput } from '../../shared/schemas/index.js'
import type { PaginatedResult, ProductDTO } from '../../shared/types.js'
import { AppError } from '../errors/app-error.js'
import {
  buildPaginationMeta,
  escapeSqlLikePattern,
  isSqliteForeignKeyConstraintError,
  rethrowUniqueAsConflict,
} from './sqlite-helpers.js'

export interface ProductRecord {
  readonly id: number
  readonly sku: string
  readonly barcode: string | null
  readonly name: string
  readonly categoryId: number | null
  readonly categoryName: string | null
  readonly unit: string
  readonly costPrice: number
  readonly sellPrice: number
  readonly stockQty: number
  readonly minStockQty: number
  readonly isActive: boolean
  readonly createdAt: string
  readonly updatedAt: string
}

interface RawProductRow {
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
}

function mapRawToRecord(row: RawProductRow): ProductRecord {
  return {
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
  }
}

export function toProductDTO(
  record: ProductRecord,
  includeCostPrice: boolean,
): ProductDTO {
  return {
    id: record.id,
    sku: record.sku,
    barcode: record.barcode,
    name: record.name,
    categoryId: record.categoryId,
    categoryName: record.categoryName,
    unit: record.unit,
    costPrice: includeCostPrice ? record.costPrice : null,
    sellPrice: record.sellPrice,
    stockQty: record.stockQty,
    minStockQty: record.minStockQty,
    isLowStock: record.isActive && record.stockQty <= record.minStockQty,
    isActive: record.isActive,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}

const BASE_PRODUCT_SELECT = `
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
`

export class ProductRepository {
  private readonly db: DatabaseSync
  private readonly stmtFindById: StatementSync
  private readonly stmtFindActiveByCode: StatementSync
  private readonly stmtInsert: StatementSync
  private readonly stmtUpdateMetadata: StatementSync

  public constructor(db: DatabaseSync) {
    this.db = db
    this.stmtFindById = db.prepare(`${BASE_PRODUCT_SELECT} WHERE p.id = ?`)
    this.stmtFindActiveByCode = db.prepare(`
      ${BASE_PRODUCT_SELECT}
      WHERE p.is_active = 1
        AND (p.sku = UPPER(?) OR p.barcode = ?)
      LIMIT 1
    `)
    this.stmtInsert = db.prepare(`
      INSERT INTO products (
        sku,
        barcode,
        name,
        category_id,
        unit,
        cost_price,
        sell_price,
        stock_qty,
        min_stock_qty,
        is_active,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, 1, ?, ?)
    `)
    this.stmtUpdateMetadata = db.prepare(`
      UPDATE products
      SET
        sku = ?,
        barcode = ?,
        name = ?,
        category_id = ?,
        unit = ?,
        cost_price = ?,
        sell_price = ?,
        min_stock_qty = ?,
        is_active = ?,
        updated_at = ?
      WHERE id = ?
    `)
  }

  public findById(id: number): ProductRecord | undefined {
    const row = this.stmtFindById.get(id) as RawProductRow | undefined
    return row ? mapRawToRecord(row) : undefined
  }

  public findByIds(ids: readonly number[]): Map<number, ProductRecord> {
    const result = new Map<number, ProductRecord>()
    if (ids.length === 0) return result

    const uniqueIds = Array.from(new Set(ids))
    const placeholders = uniqueIds.map(() => '?').join(', ')
    const stmt = this.db.prepare(`${BASE_PRODUCT_SELECT} WHERE p.id IN (${placeholders})`)
    const rows = stmt.all(...uniqueIds) as unknown as RawProductRow[]
    for (const row of rows) {
      result.set(row.id, mapRawToRecord(row))
    }
    return result
  }

  public findActiveByCode(code: string): ProductRecord | undefined {
    const trimmed = code.trim()
    if (!trimmed) return undefined
    const row = this.stmtFindActiveByCode.get(trimmed, trimmed) as
      | RawProductRow
      | undefined
    return row ? mapRawToRecord(row) : undefined
  }

  public listPaginated(
    query: ProductQueryInput,
    includeCostPrice: boolean,
  ): PaginatedResult<ProductDTO> {
    const conditions: string[] = []
    const params: SQLInputValue[] = []

    if (query.status === 'active') {
      conditions.push('p.is_active = 1')
    } else if (query.status === 'archived') {
      conditions.push('p.is_active = 0')
    }

    if (query.categoryId !== undefined) {
      conditions.push('p.category_id = ?')
      params.push(query.categoryId)
    }

    if (query.lowStockOnly) {
      conditions.push('p.stock_qty <= p.min_stock_qty')
    }

    if (query.search) {
      const escaped = `%${escapeSqlLikePattern(query.search)}%`
      conditions.push(
        "(p.name LIKE ? ESCAPE '\\' OR p.sku LIKE ? ESCAPE '\\' OR COALESCE(p.barcode, '') LIKE ? ESCAPE '\\')",
      )
      params.push(escaped, escaped.toUpperCase(), escaped)
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const countRow = this.db
      .prepare(`SELECT COUNT(*) AS total FROM products p ${whereClause}`)
      .get(...params) as { total: number } | undefined
    const totalItems = countRow?.total ?? 0

    const offset = (query.page - 1) * query.pageSize
    const rows = this.db
      .prepare(`
        ${BASE_PRODUCT_SELECT}
        ${whereClause}
        ORDER BY p.is_active DESC, p.name COLLATE NOCASE ASC, p.id ASC
        LIMIT ? OFFSET ?
      `)
      .all(...params, query.pageSize, offset) as unknown as RawProductRow[]

    return {
      items: rows.map((row) => toProductDTO(mapRawToRecord(row), includeCostPrice)),
      meta: buildPaginationMeta(query.page, query.pageSize, totalItems),
    }
  }

  public createZeroStockProduct(params: {
    sku: string
    barcode: string | null
    name: string
    categoryId: number | null
    unit: string
    costPrice: number
    sellPrice: number
    minStockQty: number
    nowIso: string
  }): ProductRecord {
    try {
      const res = this.stmtInsert.run(
        params.sku,
        params.barcode,
        params.name,
        params.categoryId,
        params.unit,
        params.costPrice,
        params.sellPrice,
        params.minStockQty,
        params.nowIso,
        params.nowIso,
      )
      const created = this.findById(Number(res.lastInsertRowid))
      if (!created) {
        throw new Error('Failed to load newly inserted product.')
      }
      return created
    } catch (error) {
      if (isSqliteForeignKeyConstraintError(error)) {
        throw AppError.badRequest('Kategori produk yang dipilih tidak ditemukan.')
      }
      rethrowUniqueAsConflict(error, 'SKU atau barcode produk sudah terdaftar.', {
        'products.sku': `SKU "${params.sku}" sudah digunakan produk lain.`,
        'products.barcode': `Barcode "${params.barcode ?? ''}" sudah digunakan produk lain.`,
      })
    }
  }

  public updateMetadata(params: {
    id: number
    sku: string
    barcode: string | null
    name: string
    categoryId: number | null
    unit: string
    costPrice: number
    sellPrice: number
    minStockQty: number
    isActive: boolean
    nowIso: string
  }): ProductRecord | undefined {
    try {
      const res = this.stmtUpdateMetadata.run(
        params.sku,
        params.barcode,
        params.name,
        params.categoryId,
        params.unit,
        params.costPrice,
        params.sellPrice,
        params.minStockQty,
        params.isActive ? 1 : 0,
        params.nowIso,
        params.id,
      )
      if (Number(res.changes) === 0) {
        return undefined
      }
      return this.findById(params.id)
    } catch (error) {
      if (isSqliteForeignKeyConstraintError(error)) {
        throw AppError.badRequest('Kategori produk yang dipilih tidak ditemukan.')
      }
      rethrowUniqueAsConflict(error, 'SKU atau barcode produk sudah terdaftar.', {
        'products.sku': `SKU "${params.sku}" sudah digunakan produk lain.`,
        'products.barcode': `Barcode "${params.barcode ?? ''}" sudah digunakan produk lain.`,
      })
    }
  }
}
