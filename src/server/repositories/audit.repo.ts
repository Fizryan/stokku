import type { DatabaseSync, SQLInputValue, StatementSync } from 'node:sqlite'
import type { AuditActionType, UserRole } from '../../shared/constants.js'
import type { AuditLogsQueryInput } from '../../shared/schemas/index.js'
import type { AuditLogDTO, PaginatedResult } from '../../shared/types.js'
import {
  buildPaginationMeta,
  dateFilterToUtcEndIso,
  dateFilterToUtcStartIso,
} from './sqlite-helpers.js'

interface RawAuditLogRow {
  id: number
  actor_user_id: number | null
  actor_name: string | null
  actor_role: UserRole | null
  action_type: AuditActionType
  resource_type: string
  resource_id: string | null
  details: string | null
  ip_address: string | null
  user_agent: string | null
  created_at: string
}

function parseDetailsJson(rawDetails: string | null): Record<string, unknown> | null {
  if (!rawDetails) return null
  try {
    return JSON.parse(rawDetails) as Record<string, unknown>
  } catch {
    return null
  }
}

function mapAuditLogRow(row: RawAuditLogRow): AuditLogDTO {
  return {
    id: row.id,
    actorUserId: row.actor_user_id,
    actorName: row.actor_name,
    actorRole: row.actor_role,
    actionType: row.action_type,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    details: parseDetailsJson(row.details),
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    createdAt: row.created_at,
  }
}

export interface CreateAuditLogParams {
  actorUserId?: number | null
  actorName?: string | null
  actorRole?: UserRole | null
  actionType: AuditActionType
  resourceType: string
  resourceId?: string | number | null
  details?: Record<string, unknown> | null
  ipAddress?: string | null
  userAgent?: string | null
  nowIso: string
}

export class AuditRepository {
  private readonly db: DatabaseSync
  private readonly stmtInsert: StatementSync
  private readonly stmtFindById: StatementSync

  public constructor(db: DatabaseSync) {
    this.db = db

    this.stmtInsert = db.prepare(`
      INSERT INTO audit_logs (
        actor_user_id,
        actor_name,
        actor_role,
        action_type,
        resource_type,
        resource_id,
        details,
        ip_address,
        user_agent,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    this.stmtFindById = db.prepare(`
      SELECT
        id,
        actor_user_id,
        actor_name,
        actor_role,
        action_type,
        resource_type,
        resource_id,
        details,
        ip_address,
        user_agent,
        created_at
      FROM audit_logs
      WHERE id = ?
    `)
  }

  public create(params: CreateAuditLogParams): AuditLogDTO {
    const detailsJson = params.details ? JSON.stringify(params.details) : null
    const resourceIdStr =
      params.resourceId !== null && params.resourceId !== undefined
        ? String(params.resourceId)
        : null

    const result = this.stmtInsert.run(
      params.actorUserId ?? null,
      params.actorName ?? null,
      params.actorRole ?? null,
      params.actionType,
      params.resourceType,
      resourceIdStr,
      detailsJson,
      params.ipAddress ?? null,
      params.userAgent ?? null,
      params.nowIso,
    )

    const insertedId = Number(result.lastInsertRowid)
    const row = this.stmtFindById.get(insertedId) as RawAuditLogRow | undefined
    if (!row) {
      throw new Error(
        `Invariant violation: newly inserted audit log #${insertedId} not found.`,
      )
    }

    return mapAuditLogRow(row)
  }

  public listPaginated(query: AuditLogsQueryInput): PaginatedResult<AuditLogDTO> {
    const whereClauses: string[] = []
    const params: SQLInputValue[] = []

    if (query.actionType) {
      whereClauses.push('action_type = ?')
      params.push(query.actionType)
    }

    if (query.actorUserId !== undefined) {
      whereClauses.push('actor_user_id = ?')
      params.push(query.actorUserId)
    }

    if (query.dateFrom) {
      whereClauses.push('created_at >= ?')
      params.push(dateFilterToUtcStartIso(query.dateFrom))
    }

    if (query.dateTo) {
      whereClauses.push('created_at <= ?')
      params.push(dateFilterToUtcEndIso(query.dateTo))
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : ''

    const countStmt = this.db.prepare(`
      SELECT COUNT(*) AS total
      FROM audit_logs
      ${whereSql}
    `)
    const countRow = countStmt.get(...params) as { total: number }
    const totalItems = countRow.total

    const offset = (query.page - 1) * query.pageSize
    const listStmt = this.db.prepare(`
      SELECT
        id,
        actor_user_id,
        actor_name,
        actor_role,
        action_type,
        resource_type,
        resource_id,
        details,
        ip_address,
        user_agent,
        created_at
      FROM audit_logs
      ${whereSql}
      ORDER BY created_at DESC, id DESC
      LIMIT ? OFFSET ?
    `)

    const rows = listStmt.all(
      ...params,
      query.pageSize,
      offset,
    ) as unknown as RawAuditLogRow[]

    return {
      items: rows.map(mapAuditLogRow),
      meta: buildPaginationMeta(query.page, query.pageSize, totalItems),
    }
  }
}
