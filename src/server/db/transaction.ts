import type { DatabaseSync } from 'node:sqlite'

let savepointSequence = 0

export function runInImmediateTransaction<T>(db: DatabaseSync, work: () => T): T {
  if (db.isTransaction) {
    savepointSequence = (savepointSequence + 1) % 1_000_000_000
    const savepointName = `sp_${savepointSequence}`
    db.exec(`SAVEPOINT ${savepointName}`)
    try {
      const result = work()
      db.exec(`RELEASE SAVEPOINT ${savepointName}`)
      return result
    } catch (error) {
      if (db.isTransaction) {
        db.exec(`ROLLBACK TO SAVEPOINT ${savepointName}`)
        db.exec(`RELEASE SAVEPOINT ${savepointName}`)
      }
      throw error
    }
  }

  db.exec('BEGIN IMMEDIATE')
  try {
    const result = work()
    db.exec('COMMIT')
    return result
  } catch (error) {
    if (db.isTransaction) {
      db.exec('ROLLBACK')
    }
    throw error
  }
}
