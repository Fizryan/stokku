import { DatabaseSync } from 'node:sqlite'

export function createDatabaseConnection(dbPath: string): DatabaseSync {
  const db = new DatabaseSync(dbPath)

  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    PRAGMA temp_store = MEMORY;
    PRAGMA cache_size = -20000;
  `)

  return db
}

export function closeDatabaseGracefully(db: DatabaseSync): void {
  if (!db.isOpen) return
  try {
    db.exec('PRAGMA optimize;')
  } catch {
    // Ignore optimize pragma errors during shutdown if read-only or interrupted
  } finally {
    db.close()
  }
}
