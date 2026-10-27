import type { DatabaseMigration } from './001_initial_schema.js'

export const migration005AuditLogs: DatabaseMigration = {
  version: 5,
  name: '005_audit_logs',
  sql: `
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      actor_name TEXT,
      actor_role TEXT,
      action_type TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      resource_id TEXT,
      details TEXT,
      ip_address TEXT,
      user_agent TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_audit_logs_created
      ON audit_logs (created_at DESC, id DESC);

    CREATE INDEX IF NOT EXISTS idx_audit_logs_action_created
      ON audit_logs (action_type, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_created
      ON audit_logs (actor_user_id, created_at DESC);
  `,
}
