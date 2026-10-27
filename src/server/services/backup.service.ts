import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import type { BackupFileDTO, UserDTO } from '../../shared/types.js'
import type {
  AuditServiceContract,
  BackupServiceContract,
  SessionClientMetadata,
} from '../contracts/services.contract.js'
import { AppError } from '../errors/app-error.js'

export interface BackupServiceDeps {
  readonly db: DatabaseSync
  readonly backupDir: string
  readonly auditService: AuditServiceContract
}

const BACKUP_FILE_REGEX = /^stokku-backup-[a-zA-Z0-9_\-.]+\.sqlite$/

export class BackupService implements BackupServiceContract {
  private readonly deps: BackupServiceDeps

  public constructor(deps: BackupServiceDeps) {
    this.deps = deps
  }

  public createBackup(actor: UserDTO, meta?: SessionClientMetadata): BackupFileDTO {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const fileName = `stokku-backup-${timestamp}.sqlite`
    const targetPath = resolve(this.deps.backupDir, fileName)

    mkdirSync(this.deps.backupDir, { recursive: true })

    const normalizedTarget = targetPath.replace(/\\/g, '/').replace(/'/g, "''")

    try {
      this.deps.db.exec(`VACUUM INTO '${normalizedTarget}';`)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      throw new Error(`Gagal membuat snapshot database backup: ${errorMsg}`)
    }

    const fileStat = statSync(targetPath)
    const nowIso = new Date().toISOString()

    this.deps.auditService.log({
      actor,
      actionType: 'BACKUP_CREATED',
      resourceType: 'backup',
      resourceId: fileName,
      details: {
        fileName,
        fileSizeBytes: fileStat.size,
      },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    })

    return {
      fileName,
      fileSizeBytes: fileStat.size,
      createdAt: nowIso,
      downloadUrl: `/api/backup/${fileName}`,
    }
  }

  public listBackups(): readonly BackupFileDTO[] {
    if (!existsSync(this.deps.backupDir)) {
      return []
    }

    const files = readdirSync(this.deps.backupDir)
    const backupFiles: BackupFileDTO[] = []

    for (const fileName of files) {
      if (!BACKUP_FILE_REGEX.test(fileName)) {
        continue
      }

      const filePath = resolve(this.deps.backupDir, fileName)
      try {
        const fileStat = statSync(filePath)
        if (!fileStat.isFile()) continue

        backupFiles.push({
          fileName,
          fileSizeBytes: fileStat.size,
          createdAt: fileStat.mtime.toISOString(),
          downloadUrl: `/api/backup/${fileName}`,
        })
      } catch {
        // Skip unreadable or locked files safely
      }
    }

    return backupFiles.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
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
