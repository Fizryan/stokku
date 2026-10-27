import type { DatabaseSync, StatementSync } from 'node:sqlite'
import type { UserRole } from '../../shared/constants.js'
import type { UserDTO } from '../../shared/types.js'
import { rethrowUniqueAsConflict } from './sqlite-helpers.js'

export interface UserRecord {
  readonly id: number
  readonly username: string
  readonly fullName: string
  readonly passwordHash: string
  readonly role: UserRole
  readonly isActive: boolean
  readonly createdAt: string
  readonly updatedAt: string
}

interface RawUserRow {
  id: number
  username: string
  full_name: string
  password_hash: string
  role: UserRole
  is_active: number
  created_at: string
  updated_at: string
}

function mapRowToRecord(row: RawUserRow): UserRecord {
  return {
    id: row.id,
    username: row.username,
    fullName: row.full_name,
    passwordHash: row.password_hash,
    role: row.role,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function toUserDTO(record: UserRecord): UserDTO {
  return {
    id: record.id,
    username: record.username,
    fullName: record.fullName,
    role: record.role,
    isActive: record.isActive,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}

export class UserRepository {
  private readonly stmtCountAll: StatementSync
  private readonly stmtCountActiveOwners: StatementSync
  private readonly stmtFindById: StatementSync
  private readonly stmtFindByUsername: StatementSync
  private readonly stmtListAll: StatementSync
  private readonly stmtInsert: StatementSync
  private readonly stmtUpdateProfile: StatementSync
  private readonly stmtUpdatePassword: StatementSync

  public constructor(db: DatabaseSync) {
    this.stmtCountAll = db.prepare('SELECT COUNT(*) AS total FROM users')
    this.stmtCountActiveOwners = db.prepare(
      "SELECT COUNT(*) AS total FROM users WHERE role = 'OWNER' AND is_active = 1",
    )
    this.stmtFindById = db.prepare(
      'SELECT id, username, full_name, password_hash, role, is_active, created_at, updated_at FROM users WHERE id = ?',
    )
    this.stmtFindByUsername = db.prepare(
      'SELECT id, username, full_name, password_hash, role, is_active, created_at, updated_at FROM users WHERE username = ?',
    )
    this.stmtListAll = db.prepare(
      'SELECT id, username, full_name, password_hash, role, is_active, created_at, updated_at FROM users ORDER BY is_active DESC, id ASC',
    )
    this.stmtInsert = db.prepare(`
      INSERT INTO users (username, full_name, password_hash, role, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, 1, ?, ?)
    `)
    this.stmtUpdateProfile = db.prepare(`
      UPDATE users
      SET full_name = ?, role = ?, is_active = ?, updated_at = ?
      WHERE id = ?
    `)
    this.stmtUpdatePassword = db.prepare(`
      UPDATE users
      SET password_hash = ?, updated_at = ?
      WHERE id = ?
    `)
  }

  public countAll(): number {
    const row = this.stmtCountAll.get() as { total: number } | undefined
    return row?.total ?? 0
  }

  public countActiveOwners(): number {
    const row = this.stmtCountActiveOwners.get() as { total: number } | undefined
    return row?.total ?? 0
  }

  public findById(id: number): UserRecord | undefined {
    const row = this.stmtFindById.get(id) as RawUserRow | undefined
    return row ? mapRowToRecord(row) : undefined
  }

  public findByUsername(username: string): UserRecord | undefined {
    const row = this.stmtFindByUsername.get(username) as RawUserRow | undefined
    return row ? mapRowToRecord(row) : undefined
  }

  public listAll(): UserDTO[] {
    const rows = this.stmtListAll.all() as unknown as RawUserRow[]
    return rows.map((row) => toUserDTO(mapRowToRecord(row)))
  }

  public create(params: {
    username: string
    fullName: string
    passwordHash: string
    role: UserRole
    nowIso: string
  }): UserDTO {
    try {
      const result = this.stmtInsert.run(
        params.username,
        params.fullName,
        params.passwordHash,
        params.role,
        params.nowIso,
        params.nowIso,
      )
      const inserted = this.findById(Number(result.lastInsertRowid))
      if (!inserted) {
        throw new Error('Failed to load newly created user.')
      }
      return toUserDTO(inserted)
    } catch (error) {
      rethrowUniqueAsConflict(error, `Username "${params.username}" sudah digunakan.`)
    }
  }

  public updateProfile(params: {
    id: number
    fullName: string
    role: UserRole
    isActive: boolean
    nowIso: string
  }): UserDTO | undefined {
    this.stmtUpdateProfile.run(
      params.fullName,
      params.role,
      params.isActive ? 1 : 0,
      params.nowIso,
      params.id,
    )
    const updated = this.findById(params.id)
    return updated ? toUserDTO(updated) : undefined
  }

  public updatePassword(id: number, passwordHash: string, nowIso: string): boolean {
    const result = this.stmtUpdatePassword.run(passwordHash, nowIso, id)
    return Number(result.changes) > 0
  }
}
