import type { DatabaseSync, SQLInputValue, StatementSync } from 'node:sqlite'
import type { SuppliersQueryInput } from '../../shared/schemas/index.js'
import type { PaginatedResult, SupplierDTO } from '../../shared/types.js'
import {
  buildPaginationMeta,
  escapeSqlLikePattern,
  rethrowUniqueAsConflict,
} from './sqlite-helpers.js'

interface RawSupplierRow {
  id: number
  name: string
  contact_person: string | null
  phone: string | null
  address: string | null
  notes: string | null
  is_active: number
  created_at: string
}

function mapSupplierRow(row: RawSupplierRow): SupplierDTO {
  return {
    id: row.id,
    name: row.name,
    contactPerson: row.contact_person,
    phone: row.phone,
    address: row.address,
    notes: row.notes,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
  }
}

export class SupplierRepository {
  private readonly db: DatabaseSync
  private readonly stmtInsert: StatementSync
  private readonly stmtUpdate: StatementSync
  private readonly stmtFindById: StatementSync
  private readonly stmtFindByName: StatementSync
  private readonly stmtListActive: StatementSync

  public constructor(db: DatabaseSync) {
    this.db = db

    this.stmtInsert = db.prepare(`
      INSERT INTO suppliers (
        name,
        contact_person,
        phone,
        address,
        notes,
        is_active,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, 1, ?)
    `)

    this.stmtUpdate = db.prepare(`
      UPDATE suppliers
      SET
        name = ?,
        contact_person = ?,
        phone = ?,
        address = ?,
        notes = ?,
        is_active = ?
      WHERE id = ?
    `)

    this.stmtFindById = db.prepare(`
      SELECT *
      FROM suppliers
      WHERE id = ?
    `)

    this.stmtFindByName = db.prepare(`
      SELECT *
      FROM suppliers
      WHERE name = ? COLLATE NOCASE
    `)

    this.stmtListActive = db.prepare(`
      SELECT *
      FROM suppliers
      WHERE is_active = 1
      ORDER BY name ASC
    `)
  }

  public create(params: {
    name: string
    contactPerson: string | null
    phone: string | null
    address: string | null
    notes: string | null
    nowIso: string
  }): number {
    try {
      const res = this.stmtInsert.run(
        params.name,
        params.contactPerson,
        params.phone,
        params.address,
        params.notes,
        params.nowIso,
      )
      return Number(res.lastInsertRowid)
    } catch (err) {
      rethrowUniqueAsConflict(
        err,
        `Supplier dengan nama "${params.name}" sudah terdaftar.`,
        { name: `Supplier dengan nama "${params.name}" sudah terdaftar.` },
      )
    }
  }

  public update(
    id: number,
    params: {
      name: string
      contactPerson: string | null
      phone: string | null
      address: string | null
      notes: string | null
      isActive: boolean
    },
  ): boolean {
    try {
      const res = this.stmtUpdate.run(
        params.name,
        params.contactPerson,
        params.phone,
        params.address,
        params.notes,
        params.isActive ? 1 : 0,
        id,
      )
      return Number(res.changes) === 1
    } catch (err) {
      rethrowUniqueAsConflict(
        err,
        `Supplier dengan nama "${params.name}" sudah terdaftar.`,
        { name: `Supplier dengan nama "${params.name}" sudah terdaftar.` },
      )
    }
  }

  public findById(id: number): SupplierDTO | undefined {
    const row = this.stmtFindById.get(id) as RawSupplierRow | undefined
    return row ? mapSupplierRow(row) : undefined
  }

  public findByName(name: string): SupplierDTO | undefined {
    const row = this.stmtFindByName.get(name) as RawSupplierRow | undefined
    return row ? mapSupplierRow(row) : undefined
  }

  public listAllActive(): readonly SupplierDTO[] {
    const rows = this.stmtListActive.all() as unknown as RawSupplierRow[]
    return rows.map(mapSupplierRow)
  }

  public listPaginated(query: SuppliersQueryInput): PaginatedResult<SupplierDTO> {
    const conditions: string[] = []
    const params: SQLInputValue[] = []

    if (query.status === 'active') {
      conditions.push('is_active = 1')
    } else if (query.status === 'archived') {
      conditions.push('is_active = 0')
    }

    if (query.search) {
      const escaped = `%${escapeSqlLikePattern(query.search)}%`
      conditions.push(
        "(name LIKE ? ESCAPE '\\' OR COALESCE(contact_person, '') LIKE ? ESCAPE '\\' OR COALESCE(phone, '') LIKE ? ESCAPE '\\')",
      )
      params.push(escaped, escaped, escaped)
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const countRow = this.db
      .prepare(`SELECT COUNT(*) AS total FROM suppliers ${whereClause}`)
      .get(...params) as { total: number } | undefined
    const totalItems = countRow?.total ?? 0

    const offset = (query.page - 1) * query.pageSize
    const rows = this.db
      .prepare(`
        SELECT *
        FROM suppliers
        ${whereClause}
        ORDER BY is_active DESC, name ASC, id ASC
        LIMIT ? OFFSET ?
      `)
      .all(...params, query.pageSize, offset) as unknown as RawSupplierRow[]

    return {
      items: rows.map(mapSupplierRow),
      meta: buildPaginationMeta(query.page, query.pageSize, totalItems),
    }
  }
}
