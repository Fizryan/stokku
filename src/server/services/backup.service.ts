import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
} from 'node:fs'
import { resolve } from 'node:path'
import { DatabaseSync, type DatabaseSync as DatabaseSyncType } from 'node:sqlite'
import type { BackupFileDTO, UserDTO } from '../../shared/types.js'
import type {
  AuditServiceContract,
  BackupServiceContract,
  SessionClientMetadata,
} from '../contracts/services.contract.js'
import { AppError } from '../errors/app-error.js'

export interface BackupServiceDeps {
  readonly db: DatabaseSyncType
  readonly backupDir: string
  readonly auditService: AuditServiceContract
  readonly retentionCount?: number
}

const BACKUP_FILE_REGEX = /^stokku-backup-[a-zA-Z0-9_\-.]+\.sqlite$/

export class BackupService implements BackupServiceContract {
  private readonly deps: BackupServiceDeps

  public constructor(deps: BackupServiceDeps) {
    this.deps = deps
  }

  public createBackup(actor: UserDTO, meta?: SessionClientMetadata): BackupFileDTO {
    return this.createVerifiedBackup('MANUAL', actor, meta)
  }

  public runScheduledBackupIfDue(now = new Date()): BackupFileDTO | null {
    if (now.getHours() !== 2) return null
    const localDate = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('-')
    const completedToday = this.deps.db
      .prepare(`
        SELECT file_name
        FROM backup_history
        WHERE mode = 'SCHEDULED'
          AND date(created_at, 'localtime') = ?
        LIMIT 1
      `)
      .get(localDate) as { file_name: string } | undefined
    if (
      completedToday &&
      existsSync(resolve(this.deps.backupDir, completedToday.file_name))
    ) {
      return null
    }
    if (completedToday) {
      this.deps.db
        .prepare('DELETE FROM backup_history WHERE file_name = ?')
        .run(completedToday.file_name)
    }
    return this.createVerifiedBackup('SCHEDULED', undefined, undefined, now)
  }

  private createVerifiedBackup(
    mode: 'MANUAL' | 'SCHEDULED',
    actor?: UserDTO,
    meta?: SessionClientMetadata,
    createdAt = new Date(),
  ): BackupFileDTO {
    const nowIso = createdAt.toISOString()
    const timestamp = nowIso.replace(/[:.]/g, '-')
    const fileName = `stokku-backup-${timestamp}.sqlite`
    const targetPath = resolve(this.deps.backupDir, fileName)

    mkdirSync(this.deps.backupDir, { recursive: true })

    const normalizedTarget = targetPath.replaceAll('\\', '/').replaceAll("'", "''")

    try {
      this.deps.db.exec(`VACUUM INTO '${normalizedTarget}';`)
    } catch (err) {
      if (existsSync(targetPath)) unlinkSync(targetPath)
      const errorMsg = err instanceof Error ? err.message : String(err)
      throw new Error(`Gagal membuat snapshot database backup: ${errorMsg}`)
    }

    const fileStat = statSync(targetPath)
    let integrityResult: string | null = null
    let snapshotDb: DatabaseSyncType | null = null
    try {
      snapshotDb = new DatabaseSync(targetPath, { readOnly: true })
      const result = snapshotDb.prepare('PRAGMA integrity_check').get() as
        | { integrity_check: string }
        | undefined
      integrityResult = result?.integrity_check ?? null
    } catch (error) {
      snapshotDb?.close()
      unlinkSync(targetPath)
      const errorMsg = error instanceof Error ? error.message : String(error)
      throw new Error(`Gagal memverifikasi integritas backup "${fileName}": ${errorMsg}`)
    } finally {
      if (snapshotDb?.isOpen) snapshotDb.close()
    }

    if (integrityResult !== 'ok') {
      unlinkSync(targetPath)
      throw new Error(
        `Backup "${fileName}" gagal verifikasi integritas: ${integrityResult ?? 'tidak ada hasil'}.`,
      )
    }

    this.deps.db
      .prepare(`
        INSERT INTO backup_history (file_name, created_at, mode, verified)
        VALUES (?, ?, ?, 1)
      `)
      .run(fileName, nowIso, mode)

    this.deps.auditService.log({
      actor,
      actionType: 'BACKUP_CREATED',
      resourceType: 'backup',
      resourceId: fileName,
      details: {
        fileName,
        fileSizeBytes: fileStat.size,
        mode,
        verified: true,
      },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    })

    this.applyRetention()
    return {
      fileName,
      fileSizeBytes: fileStat.size,
      createdAt: nowIso,
      downloadUrl: `/api/backup/${fileName}`,
      verified: true,
      mode,
    }
  }

  public listBackups(): readonly BackupFileDTO[] {
    if (!existsSync(this.deps.backupDir)) {
      return []
    }

    const files = readdirSync(this.deps.backupDir)
    const backupFiles: BackupFileDTO[] = []
    const historyRows = this.deps.db
      .prepare('SELECT file_name, mode, verified, created_at FROM backup_history')
      .all() as Array<{
      file_name: string
      mode: 'MANUAL' | 'SCHEDULED'
      verified: number
      created_at: string
    }>
    const historyByName = new Map(historyRows.map((row) => [row.file_name, row]))

    for (const fileName of files) {
      if (!BACKUP_FILE_REGEX.test(fileName)) {
        continue
      }

      const filePath = resolve(this.deps.backupDir, fileName)
      const fileStat = statSync(filePath)
      if (!fileStat.isFile()) continue
      const history = historyByName.get(fileName)
      backupFiles.push({
        fileName,
        fileSizeBytes: fileStat.size,
        createdAt: history?.created_at ?? fileStat.mtime.toISOString(),
        downloadUrl: `/api/backup/${fileName}`,
        verified: history?.verified === 1,
        mode: history?.mode ?? 'MANUAL',
      })
    }

    return backupFiles.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  private applyRetention(): void {
    const retentionCount = this.deps.retentionCount ?? 30
    const backups = [...this.listBackups()]
    for (const backup of backups.slice(retentionCount)) {
      unlinkSync(this.getBackupFilePath(backup.fileName))
      this.deps.db
        .prepare('DELETE FROM backup_history WHERE file_name = ?')
        .run(backup.fileName)
    }
  }

  public getBackupFilePath(fileName: string): string {
    if (!BACKUP_FILE_REGEX.test(fileName)) {
      throw AppError.badRequest('Nama file backup tidak valid.')
    }

    const resolvedDir = resolve(this.deps.backupDir)
    const targetPath = resolve(resolvedDir, fileName)

    if (!targetPath.startsWith(resolvedDir)) {
      throw AppError.forbidden('Akses path tidak diizinkan.')
    }

    if (!existsSync(targetPath)) {
      throw AppError.notFound('File backup tidak ditemukan.')
    }

    return targetPath
  }

  public getBackupFileBuffer(fileName: string): Uint8Array {
    const targetPath = this.getBackupFilePath(fileName)
    return readFileSync(targetPath)
  }
}
