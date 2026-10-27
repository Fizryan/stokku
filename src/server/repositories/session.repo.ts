import type { DatabaseSync, StatementSync } from 'node:sqlite'
import type { UserRole } from '../../shared/constants.js'
import type { UserDTO } from '../../shared/types.js'

export interface SessionWithUserRow {
  readonly sessionId: string
  readonly expiresAt: string
  readonly createdAt: string
  readonly user: UserDTO
}

interface RawJoinedSessionRow {
  session_id: string
  expires_at: string
  session_created_at: string
  user_id: number
  username: string
  full_name: string
  role: UserRole
  is_active: number
  user_created_at: string
  user_updated_at: string
}

export class SessionRepository {
  private readonly stmtInsert: StatementSync
  private readonly stmtFindActiveByHash: StatementSync
  private readonly stmtExtendExpiry: StatementSync
  private readonly stmtDeleteByHash: StatementSync
  private readonly stmtDeleteAllForUser: StatementSync
  private readonly stmtDeleteAllExceptSession: StatementSync
  private readonly stmtDeleteExpired: StatementSync

  public constructor(db: DatabaseSync) {
    this.stmtInsert = db.prepare(`
      INSERT INTO sessions (id, token_hash, user_id, expires_at, ip_address, user_agent, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    this.stmtFindActiveByHash = db.prepare(`
      SELECT
        s.id AS session_id,
        s.expires_at,
        s.created_at AS session_created_at,
        u.id AS user_id,
        u.username,
        u.full_name,
        u.role,
        u.is_active,
        u.created_at AS user_created_at,
        u.updated_at AS user_updated_at
      FROM sessions s
      INNER JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?
        AND s.expires_at > ?
        AND u.is_active = 1
      LIMIT 1
    `)
    this.stmtExtendExpiry = db.prepare('UPDATE sessions SET expires_at = ? WHERE id = ?')
    this.stmtDeleteByHash = db.prepare('DELETE FROM sessions WHERE token_hash = ?')
    this.stmtDeleteAllForUser = db.prepare('DELETE FROM sessions WHERE user_id = ?')
    this.stmtDeleteAllExceptSession = db.prepare(
      'DELETE FROM sessions WHERE user_id = ? AND id != ?',
    )
    this.stmtDeleteExpired = db.prepare('DELETE FROM sessions WHERE expires_at <= ?')
  }

  public create(params: {
    id: string
    tokenHash: string
    userId: number
    expiresAtIso: string
    ipAddress: string | null
    userAgent: string | null
    nowIso: string
  }): void {
    this.stmtInsert.run(
      params.id,
      params.tokenHash,
      params.userId,
      params.expiresAtIso,
      params.ipAddress,
      params.userAgent,
      params.nowIso,
    )
  }

  public findActiveByTokenHash(
    tokenHash: string,
    nowIso: string,
  ): SessionWithUserRow | undefined {
    const row = this.stmtFindActiveByHash.get(tokenHash, nowIso) as
      | RawJoinedSessionRow
      | undefined
    if (!row) return undefined

    return {
      sessionId: row.session_id,
      expiresAt: row.expires_at,
      createdAt: row.session_created_at,
      user: {
        id: row.user_id,
        username: row.username,
        fullName: row.full_name,
        role: row.role,
        isActive: row.is_active === 1,
        createdAt: row.user_created_at,
        updatedAt: row.user_updated_at,
      },
    }
  }

  public extendExpiry(sessionId: string, newExpiresAtIso: string): void {
    this.stmtExtendExpiry.run(newExpiresAtIso, sessionId)
  }

  public deleteByTokenHash(tokenHash: string): void {
    this.stmtDeleteByHash.run(tokenHash)
  }

  public deleteAllForUser(userId: number): void {
    this.stmtDeleteAllForUser.run(userId)
  }

  public deleteAllExceptSession(userId: number, keepSessionId: string): void {
    this.stmtDeleteAllExceptSession.run(userId, keepSessionId)
  }

  public deleteExpired(nowIso: string): number {
    const res = this.stmtDeleteExpired.run(nowIso)
    return Number(res.changes)
  }
}
