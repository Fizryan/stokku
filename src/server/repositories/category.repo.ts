import type { DatabaseSync, StatementSync } from 'node:sqlite'
import type { CategoryDTO } from '../../shared/types.js'
import { AppError } from '../errors/app-error.js'
import {
  isSqliteForeignKeyConstraintError,
  rethrowUniqueAsConflict,
} from './sqlite-helpers.js'

interface RawCategoryRow {
  id: number
  name: string
  description: string | null
  product_count: number
  created_at: string
}

function mapCategoryRow(row: RawCategoryRow): CategoryDTO {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    productCount: row.product_count,
    createdAt: row.created_at,
  }
}

export class CategoryRepository {
  private readonly stmtListAll: StatementSync
  private readonly stmtFindById: StatementSync
  private readonly stmtInsert: StatementSync
  private readonly stmtUpdate: StatementSync
  private readonly stmtDelete: StatementSync

  public constructor(db: DatabaseSync) {
    this.stmtListAll = db.prepare(`
      SELECT
        c.id,
        c.name,
        c.description,
        c.created_at,
        COUNT(p.id) AS product_count
      FROM categories c
      LEFT JOIN products p ON p.category_id = c.id
      GROUP BY c.id
      ORDER BY c.name COLLATE NOCASE ASC
    `)
    this.stmtFindById = db.prepare(`
      SELECT
        c.id,
        c.name,
        c.description,
        c.created_at,
        COUNT(p.id) AS product_count
      FROM categories c
      LEFT JOIN products p ON p.category_id = c.id
      WHERE c.id = ?
      GROUP BY c.id
    `)
    this.stmtInsert = db.prepare(`
      INSERT INTO categories (name, description, created_at)
      VALUES (?, ?, ?)
    `)
    this.stmtUpdate = db.prepare(`
      UPDATE categories
      SET name = ?, description = ?
      WHERE id = ?
    `)
    this.stmtDelete = db.prepare('DELETE FROM categories WHERE id = ?')
  }

  public listAll(): CategoryDTO[] {
    const rows = this.stmtListAll.all() as unknown as RawCategoryRow[]
    return rows.map(mapCategoryRow)
  }

  public findById(id: number): CategoryDTO | undefined {
    const row = this.stmtFindById.get(id) as RawCategoryRow | undefined
    return row ? mapCategoryRow(row) : undefined
  }

  public create(name: string, description: string | null, nowIso: string): CategoryDTO {
    try {
      const result = this.stmtInsert.run(name, description, nowIso)
      const created = this.findById(Number(result.lastInsertRowid))
      if (!created) {
        throw new Error('Failed to load newly created category.')
      }
      return created
    } catch (error) {
      rethrowUniqueAsConflict(error, `Kategori "${name}" sudah terdaftar.`)
    }
  }

  public update(
    id: number,
    name: string,
    description: string | null,
  ): CategoryDTO | undefined {
    try {
      const res = this.stmtUpdate.run(name, description, id)
      if (Number(res.changes) === 0) {
        return undefined
      }
      return this.findById(id)
    } catch (error) {
      rethrowUniqueAsConflict(error, `Kategori "${name}" sudah terdaftar.`)
    }
  }

  public delete(id: number): boolean {
    try {
      const res = this.stmtDelete.run(id)
      return Number(res.changes) > 0
    } catch (error) {
      if (isSqliteForeignKeyConstraintError(error)) {
        throw AppError.conflict(
          'Kategori tidak dapat dihapus karena masih digunakan oleh satu atau lebih produk.',
        )
      }
      throw error
    }
  }
}
