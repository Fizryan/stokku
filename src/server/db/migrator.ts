import type { DatabaseSync } from 'node:sqlite'
import {
  type DatabaseMigration,
  migration001InitialSchema,
} from './migrations/001_initial_schema.js'
import { migration002CashShifts } from './migrations/002_cash_shifts.js'
import { migration003PurchasesAndSuppliers } from './migrations/003_purchases_and_suppliers.js'
import { migration004CustomersAndLoyalty } from './migrations/004_customers_and_loyalty.js'
import { migration005AuditLogs } from './migrations/005_audit_logs.js'
import { runInImmediateTransaction } from './transaction.js'

const ALL_MIGRATIONS: readonly DatabaseMigration[] = [
  migration001InitialSchema,
  migration002CashShifts,
  migration003PurchasesAndSuppliers,
  migration004CustomersAndLoyalty,
  migration005AuditLogs,
]

export function runDatabaseMigrations(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `)

  const appliedRows = db
    .prepare('SELECT version FROM schema_migrations ORDER BY version ASC')
    .all() as Array<{ version: number }>

  const appliedVersions = new Set<number>(appliedRows.map((row) => row.version))

  for (const migration of ALL_MIGRATIONS) {
    if (appliedVersions.has(migration.version)) {
      continue
    }

    runInImmediateTransaction(db, () => {
      db.exec(migration.sql)
      db.prepare(
        'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)',
      ).run(migration.version, migration.name, new Date().toISOString())
    })
  }
}
