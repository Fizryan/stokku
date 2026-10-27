import type { DatabaseSync, SQLInputValue, StatementSync } from 'node:sqlite'
import type { PointMutationType } from '../../shared/constants.js'
import type { CustomersQueryInput } from '../../shared/schemas/customer.schema.js'
import type {
  CustomerDTO,
  CustomerPointMutationDTO,
  PaginatedResult,
} from '../../shared/types.js'
import { buildPaginationMeta, escapeSqlLikePattern } from './sqlite-helpers.js'

interface RawCustomerRow {
  id: number
  phone: string
  name: string
  email: string | null
  address: string | null
  notes: string | null
  points_balance: number
  total_spend: number
  visit_count: number
  is_active: number
  created_at: string
}

interface RawPointMutationRow {
  id: number
  customer_id: number
  points: number
  mutation_type: PointMutationType
  reference_type: 'SALE' | 'MANUAL'
  reference_id: number | null
  description: string
  actor_user_id: number
  actor_name: string
  created_at: string
}

function mapCustomerRow(row: RawCustomerRow): CustomerDTO {
  return {
    id: row.id,
    phone: row.phone,
    name: row.name,
    email: row.email,
    address: row.address,
    notes: row.notes,
    pointsBalance: row.points_balance,
    totalSpend: row.total_spend,
    visitCount: row.visit_count,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
  }
}

function mapMutationRow(row: RawPointMutationRow): CustomerPointMutationDTO {
  return {
    id: row.id,
    customerId: row.customer_id,
    points: row.points,
    mutationType: row.mutation_type,
    referenceType: row.reference_type,
    referenceId: row.reference_id,
    description: row.description,
    actorUserId: row.actor_user_id,
    actorName: row.actor_name,
    createdAt: row.created_at,
  }
}

export class CustomerRepository {
  private readonly db: DatabaseSync
  private readonly stmtInsertCustomer: StatementSync
  private readonly stmtUpdateCustomer: StatementSync
  private readonly stmtFindById: StatementSync
  private readonly stmtFindByPhone: StatementSync
  private readonly stmtInsertMutation: StatementSync
  private readonly stmtAdjustBalance: StatementSync
  private readonly stmtIncrementSpendAndVisit: StatementSync
  private readonly stmtDecrementSpendAndVisit: StatementSync
  private readonly stmtListMutationsByCustomerId: StatementSync
  private readonly stmtFindTopCustomers: StatementSync

  public constructor(db: DatabaseSync) {
    this.db = db

    this.stmtInsertCustomer = db.prepare(`
      INSERT INTO customers (
        phone,
        name,
        email,
        address,
        notes,
        points_balance,
        total_spend,
        visit_count,
        is_active,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, 0, 0, 0, 1, ?)
    `)

    this.stmtUpdateCustomer = db.prepare(`
      UPDATE customers
      SET
        name = ?,
        email = ?,
        address = ?,
        notes = ?,
        is_active = ?
      WHERE id = ?
    `)

    this.stmtFindById = db.prepare(`
      SELECT
        id,
        phone,
        name,
        email,
        address,
        notes,
        points_balance,
        total_spend,
        visit_count,
        is_active,
        created_at
      FROM customers
      WHERE id = ?
    `)

    this.stmtFindByPhone = db.prepare(`
      SELECT
        id,
        phone,
        name,
        email,
        address,
        notes,
        points_balance,
        total_spend,
        visit_count,
        is_active,
        created_at
      FROM customers
      WHERE phone = ?
    `)

    this.stmtInsertMutation = db.prepare(`
      INSERT INTO customer_point_mutations (
        customer_id,
        points,
        mutation_type,
        reference_type,
        reference_id,
        description,
        actor_user_id,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)

    this.stmtAdjustBalance = db.prepare(`
      UPDATE customers
      SET points_balance = points_balance + ?
      WHERE id = ? AND (points_balance + ?) >= 0
    `)

    this.stmtIncrementSpendAndVisit = db.prepare(`
      UPDATE customers
      SET
        points_balance = points_balance + ?,
        total_spend = total_spend + ?,
        visit_count = visit_count + 1
      WHERE id = ?
    `)

    this.stmtDecrementSpendAndVisit = db.prepare(`
      UPDATE customers
      SET
        points_balance = MAX(0, points_balance + ?),
        total_spend = MAX(0, total_spend - ?),
        visit_count = MAX(0, visit_count - 1)
      WHERE id = ?
    `)

    this.stmtListMutationsByCustomerId = db.prepare(`
      SELECT
        m.id,
        m.customer_id,
        m.points,
        m.mutation_type,
        m.reference_type,
        m.reference_id,
        m.description,
        m.actor_user_id,
        u.full_name AS actor_name,
        m.created_at
      FROM customer_point_mutations m
      INNER JOIN users u ON u.id = m.actor_user_id
      WHERE m.customer_id = ?
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT ?
    `)

    this.stmtFindTopCustomers = db.prepare(`
      SELECT
        id,
        phone,
        name,
        email,
        address,
        notes,
        points_balance,
        total_spend,
        visit_count,
        is_active,
        created_at
      FROM customers
      WHERE is_active = 1
      ORDER BY total_spend DESC, points_balance DESC
      LIMIT ?
    `)
  }

  public create(params: {
    phone: string
    name: string
    email: string | null
    address: string | null
    notes: string | null
    nowIso: string
  }): number {
    const res = this.stmtInsertCustomer.run(
      params.phone,
      params.name,
      params.email,
      params.address,
      params.notes,
      params.nowIso,
    )
    return Number(res.lastInsertRowid)
  }

  public update(
    id: number,
    params: {
      name: string
      email: string | null
      address: string | null
      notes: string | null
      isActive: boolean
    },
  ): boolean {
    const res = this.stmtUpdateCustomer.run(
      params.name,
      params.email,
      params.address,
      params.notes,
      params.isActive ? 1 : 0,
      id,
    )
    return Number(res.changes) === 1
  }

  public findById(id: number): CustomerDTO | undefined {
    const row = this.stmtFindById.get(id) as RawCustomerRow | undefined
    return row ? mapCustomerRow(row) : undefined
  }

  public findByPhone(phone: string): CustomerDTO | undefined {
    const row = this.stmtFindByPhone.get(phone) as RawCustomerRow | undefined
    return row ? mapCustomerRow(row) : undefined
  }

  public recordPointMutationInTx(params: {
    customerId: number
    points: number
    mutationType: PointMutationType
    referenceType: 'SALE' | 'MANUAL'
    referenceId: number | null
    description: string
    actorUserId: number
    nowIso: string
  }): number {
    const res = this.stmtInsertMutation.run(
      params.customerId,
      params.points,
      params.mutationType,
      params.referenceType,
      params.referenceId,
      params.description,
      params.actorUserId,
      params.nowIso,
    )
    return Number(res.lastInsertRowid)
  }

  public adjustBalanceInTx(customerId: number, deltaPoints: number): boolean {
    const res = this.stmtAdjustBalance.run(deltaPoints, customerId, deltaPoints)
    return Number(res.changes) === 1
  }

  public incrementSpendAndVisitInTx(
    customerId: number,
    spendAmount: number,
    deltaPoints: number,
  ): boolean {
    const res = this.stmtIncrementSpendAndVisit.run(deltaPoints, spendAmount, customerId)
    return Number(res.changes) === 1
  }

  public decrementSpendAndVisitInTx(
    customerId: number,
    spendAmount: number,
    deltaPoints: number,
  ): boolean {
    const res = this.stmtDecrementSpendAndVisit.run(deltaPoints, spendAmount, customerId)
    return Number(res.changes) === 1
  }

  public listPointMutationsByCustomerId(
    customerId: number,
    limit = 50,
  ): readonly CustomerPointMutationDTO[] {
    const rows = this.stmtListMutationsByCustomerId.all(
      customerId,
      limit,
    ) as unknown as RawPointMutationRow[]
    return rows.map(mapMutationRow)
  }

  public findTopCustomers(limit = 10): readonly CustomerDTO[] {
    const rows = this.stmtFindTopCustomers.all(limit) as unknown as RawCustomerRow[]
    return rows.map(mapCustomerRow)
  }

  public listPaginated(query: CustomersQueryInput): PaginatedResult<CustomerDTO> {
    const conditions: string[] = []
    const params: SQLInputValue[] = []

    if (query.status === 'active') {
      conditions.push('is_active = 1')
    } else if (query.status === 'inactive') {
      conditions.push('is_active = 0')
    }

    if (query.search) {
      const escaped = `%${escapeSqlLikePattern(query.search)}%`
      conditions.push("(phone LIKE ? ESCAPE '\\' OR name LIKE ? ESCAPE '\\')")
      params.push(escaped, escaped)
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const countRow = this.db
      .prepare(`SELECT COUNT(*) AS total FROM customers ${whereClause}`)
      .get(...params) as { total: number } | undefined
    const totalItems = countRow?.total ?? 0

    const offset = (query.page - 1) * query.pageSize
    const rows = this.db
      .prepare(`
        SELECT
          id,
          phone,
          name,
          email,
          address,
          notes,
          points_balance,
          total_spend,
          visit_count,
          is_active,
          created_at
        FROM customers
        ${whereClause}
        ORDER BY created_at DESC, id DESC
        LIMIT ? OFFSET ?
      `)
      .all(...params, query.pageSize, offset) as unknown as RawCustomerRow[]

    return {
      items: rows.map(mapCustomerRow),
      meta: buildPaginationMeta(query.page, query.pageSize, totalItems),
    }
  }
}
