import type { DatabaseSync } from 'node:sqlite'
import {
  type DatabaseMigration,
  migration001InitialSchema,
} from './migrations/001_initial_schema.js'
import { runInImmediateTransaction } from './transaction.js'

const ALL_MIGRATIONS: readonly DatabaseMigration[] = [migration001InitialSchema]

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
