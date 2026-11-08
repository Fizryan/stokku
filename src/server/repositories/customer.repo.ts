import type { DatabaseSync, SQLInputValue, StatementSync } from 'node:sqlite'
import { getLoyaltyTier, type PointMutationType } from '../../shared/constants.js'
import { formatRupiah } from '../../shared/formatters.js'
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
  expires_at: string | null
}

function mapCustomerRow(row: RawCustomerRow): CustomerDTO {
  const tier = getLoyaltyTier(row.total_spend)
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
    loyaltyTier: {
      ...tier,
      reason:
        tier.minimumSpend === 0
          ? 'Tier dasar untuk seluruh pelanggan.'
          : `Total belanja ${formatRupiah(row.total_spend)} memenuhi minimum ${formatRupiah(tier.minimumSpend)}.`,
    },
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
    expiresAt: row.expires_at,
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
        c.id,
        c.phone,
        c.name,
        c.email,
        c.address,
        c.notes,
        COALESCE((
          SELECT SUM(l.remaining_points)
          FROM customer_point_lots l
          WHERE l.customer_id = c.id AND l.expires_at > ?
        ), 0) AS points_balance,
        c.total_spend,
        c.visit_count,
        c.is_active,
        c.created_at
      FROM customers c
      WHERE c.id = ?
    `)

    this.stmtFindByPhone = db.prepare(`
      SELECT
        c.id,
        c.phone,
        c.name,
        c.email,
        c.address,
        c.notes,
        COALESCE((
          SELECT SUM(l.remaining_points)
          FROM customer_point_lots l
          WHERE l.customer_id = c.id AND l.expires_at > ?
        ), 0) AS points_balance,
        c.total_spend,
        c.visit_count,
        c.is_active,
        c.created_at
      FROM customers c
      WHERE c.phone = ?
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
        created_at,
        expires_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        m.created_at,
        m.expires_at
      FROM customer_point_mutations m
      INNER JOIN users u ON u.id = m.actor_user_id
      WHERE m.customer_id = ?
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT ?
    `)

    this.stmtFindTopCustomers = db.prepare(`
      SELECT
        c.id,
        c.phone,
        c.name,
        c.email,
        c.address,
        c.notes,
        COALESCE((
          SELECT SUM(l.remaining_points)
          FROM customer_point_lots l
          WHERE l.customer_id = c.id AND l.expires_at > ?
        ), 0) AS points_balance,
        c.total_spend,
        c.visit_count,
        c.is_active,
        c.created_at
      FROM customers c
      WHERE c.is_active = 1
      ORDER BY c.total_spend DESC, points_balance DESC
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
    const row = this.stmtFindById.get(new Date().toISOString(), id) as
      | RawCustomerRow
      | undefined
    return row ? mapCustomerRow(row) : undefined
  }

  public findByPhone(phone: string): CustomerDTO | undefined {
    const row = this.stmtFindByPhone.get(new Date().toISOString(), phone) as
      | RawCustomerRow
      | undefined
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
    expiresAt?: string | null
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
      params.expiresAt ?? null,
    )
    return Number(res.lastInsertRowid)
  }

  public adjustBalanceInTx(customerId: number, deltaPoints: number): boolean {
    const res = this.stmtAdjustBalance.run(deltaPoints, customerId, deltaPoints)
    return Number(res.changes) === 1
  }

  public createPointLotInTx(params: {
    customerId: number
    sourceMutationId: number | null
    points: number
    expiresAt: string
  }): void {
    this.db
      .prepare(`
      INSERT INTO customer_point_lots (
        customer_id, source_mutation_id, remaining_points, expires_at
      )
      VALUES (?, ?, ?, ?)
    `)
      .run(params.customerId, params.sourceMutationId, params.points, params.expiresAt)
  }

  public consumePointsInTx(
    customerId: number,
    points: number,
    mutationId: number,
    nowIso: string,
  ): boolean {
    let remaining = points
    const lots = this.db
      .prepare(`
      SELECT id, remaining_points
      FROM customer_point_lots
      WHERE customer_id = ? AND remaining_points > 0 AND expires_at > ?
      ORDER BY expires_at ASC, id ASC
    `)
      .all(customerId, nowIso) as Array<{ id: number; remaining_points: number }>

    for (const lot of lots) {
      if (remaining === 0) break
      const allocated = Math.min(remaining, lot.remaining_points)
      const update = this.db
        .prepare(`
        UPDATE customer_point_lots
        SET remaining_points = remaining_points - ?
        WHERE id = ? AND remaining_points >= ?
      `)
        .run(allocated, lot.id, allocated)
      if (Number(update.changes) !== 1) return false
      this.recordLotAllocationInTx(mutationId, lot.id, allocated)
      remaining -= allocated
    }

    return remaining === 0
  }

  public expirePointsInTx(
    customerId: number,
    actorUserId: number,
    nowIso: string,
  ): number {
    const row = this.db
      .prepare(`
      SELECT COALESCE(SUM(remaining_points), 0) AS points
      FROM customer_point_lots
      WHERE customer_id = ? AND remaining_points > 0 AND expires_at <= ?
    `)
      .get(customerId, nowIso) as { points: number }
    const expiredPoints = row.points
    if (expiredPoints === 0) return 0

    this.db
      .prepare(`
      UPDATE customer_point_lots
      SET remaining_points = 0
      WHERE customer_id = ? AND remaining_points > 0 AND expires_at <= ?
    `)
      .run(customerId, nowIso)
    if (!this.adjustBalanceInTx(customerId, -expiredPoints)) {
      throw new Error(
        `Gagal memperbarui saldo poin kedaluwarsa pelanggan #${customerId}.`,
      )
    }
    this.recordPointMutationInTx({
      customerId,
      points: -expiredPoints,
      mutationType: 'EXPIRED',
      referenceType: 'MANUAL',
      referenceId: null,
      description: `${expiredPoints} poin kedaluwarsa otomatis.`,
      actorUserId,
      nowIso,
    })
    return expiredPoints
  }

  public findSalePointMutationId(
    customerId: number,
    saleId: number,
    mutationType: PointMutationType,
  ): number | null {
    const row = this.db
      .prepare(`
      SELECT id
      FROM customer_point_mutations
      WHERE customer_id = ? AND reference_type = 'SALE'
        AND reference_id = ? AND mutation_type = ?
      ORDER BY id ASC
      LIMIT 1
    `)
      .get(customerId, saleId, mutationType) as { id: number } | undefined
    return row?.id ?? null
  }

  public getRestorablePointsInTx(mutationId: number, nowIso: string): number {
    const row = this.db
      .prepare(`
      SELECT COALESCE(SUM(a.points), 0) AS points
      FROM customer_point_lot_allocations a
      INNER JOIN customer_point_lots l ON l.id = a.lot_id
      WHERE a.mutation_id = ? AND l.expires_at > ?
    `)
      .get(mutationId, nowIso) as { points: number }
    return row.points
  }

  public restorePointsInTx(params: {
    sourceMutationId: number | null
    restorationMutationId: number
    fallbackCustomerId: number
    fallbackPoints: number
    nowIso: string
    fallbackExpiresAt: string
  }): number {
    if (params.sourceMutationId === null) {
      if (params.fallbackPoints > 0) {
        this.createPointLotInTx({
          customerId: params.fallbackCustomerId,
          sourceMutationId: params.restorationMutationId,
          points: params.fallbackPoints,
          expiresAt: params.fallbackExpiresAt,
        })
      }
      return params.fallbackPoints
    }

    const allocations = this.db
      .prepare(`
      SELECT a.lot_id, a.points
      FROM customer_point_lot_allocations a
      INNER JOIN customer_point_lots l ON l.id = a.lot_id
      WHERE a.mutation_id = ? AND l.expires_at > ?
    `)
      .all(params.sourceMutationId, params.nowIso) as Array<{
      lot_id: number
      points: number
    }>
    let restoredPoints = 0
    for (const allocation of allocations) {
      this.db
        .prepare(`
        UPDATE customer_point_lots
        SET remaining_points = remaining_points + ?
        WHERE id = ?
      `)
        .run(allocation.points, allocation.lot_id)
      this.recordLotAllocationInTx(
        params.restorationMutationId,
        allocation.lot_id,
        allocation.points,
      )
      restoredPoints += allocation.points
    }
    return restoredPoints
  }

  public getReversibleEarnedPointsInTx(
    customerId: number,
    saleId: number,
    fallbackPoints: number,
  ): number {
    const row = this.db
      .prepare(`
      SELECT l.remaining_points
      FROM customer_point_lots l
      INNER JOIN customer_point_mutations m ON m.id = l.source_mutation_id
      WHERE l.customer_id = ? AND m.reference_type = 'SALE'
        AND m.reference_id = ? AND m.mutation_type = 'EARNED'
    `)
      .get(customerId, saleId) as { remaining_points: number } | undefined
    if (row) return row.remaining_points

    const balance = this.db
      .prepare(`
      SELECT points_balance FROM customers WHERE id = ?
    `)
      .get(customerId) as { points_balance: number }
    return Math.min(fallbackPoints, balance.points_balance)
  }

  public reverseEarnedPointsInTx(params: {
    customerId: number
    saleId: number
    points: number
    mutationId: number
    nowIso: string
  }): boolean {
    const result = this.db
      .prepare(`
      UPDATE customer_point_lots
      SET remaining_points = 0
      WHERE id = (
        SELECT l.id
        FROM customer_point_lots l
        INNER JOIN customer_point_mutations m ON m.id = l.source_mutation_id
        WHERE l.customer_id = ? AND m.reference_type = 'SALE'
          AND m.reference_id = ? AND m.mutation_type = 'EARNED'
      )
    `)
      .run(params.customerId, params.saleId)
    if (Number(result.changes) > 0) return true

    return this.consumePointsInTx(
      params.customerId,
      params.points,
      params.mutationId,
      params.nowIso,
    )
  }

  private recordLotAllocationInTx(
    mutationId: number,
    lotId: number,
    points: number,
  ): void {
    this.db
      .prepare(`
      INSERT INTO customer_point_lot_allocations (mutation_id, lot_id, points)
      VALUES (?, ?, ?)
    `)
      .run(mutationId, lotId, points)
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
    const rows = this.stmtFindTopCustomers.all(
      new Date().toISOString(),
      limit,
    ) as unknown as RawCustomerRow[]
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
      conditions.push(String.raw`(phone LIKE ? ESCAPE '\' OR name LIKE ? ESCAPE '\')`)
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
          c.id,
          c.phone,
          c.name,
          c.email,
          c.address,
          c.notes,
          COALESCE((
            SELECT SUM(l.remaining_points)
            FROM customer_point_lots l
            WHERE l.customer_id = c.id AND l.expires_at > ?
          ), 0) AS points_balance,
          c.total_spend,
          c.visit_count,
          c.is_active,
          c.created_at
        FROM customers c
        ${whereClause}
        ORDER BY c.created_at DESC, c.id DESC
        LIMIT ? OFFSET ?
      `)
      .all(
        new Date().toISOString(),
        ...params,
        query.pageSize,
        offset,
      ) as unknown as RawCustomerRow[]

    return {
      items: rows.map(mapCustomerRow),
      meta: buildPaginationMeta(query.page, query.pageSize, totalItems),
    }
  }
}
