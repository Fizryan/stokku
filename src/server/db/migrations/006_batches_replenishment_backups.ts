import type { DatabaseMigration } from './001_initial_schema.js'

export const migration006BatchesReplenishmentBackups: DatabaseMigration = {
  version: 6,
  name: '006_batches_replenishment_backups',
  sql: `
    ALTER TABLE purchase_items ADD COLUMN expiry_date TEXT;
    ALTER TABLE suppliers ADD COLUMN lead_time_days INTEGER NOT NULL DEFAULT 7
      CHECK (lead_time_days BETWEEN 1 AND 365);

    CREATE TABLE IF NOT EXISTS stock_batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      source_type TEXT NOT NULL CHECK (source_type IN ('LEGACY', 'INITIAL', 'PURCHASE', 'MANUAL')),
      source_id INTEGER,
      qty_received INTEGER NOT NULL CHECK (qty_received > 0),
      qty_remaining INTEGER NOT NULL CHECK (qty_remaining >= 0 AND qty_remaining <= qty_received),
      expiry_date TEXT,
      unit_cost INTEGER NOT NULL CHECK (unit_cost >= 0),
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_stock_batches_fefo
      ON stock_batches (product_id, expiry_date, created_at, id);

    CREATE TABLE IF NOT EXISTS sale_batch_allocations (
      sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
      batch_id INTEGER NOT NULL REFERENCES stock_batches(id) ON DELETE RESTRICT,
      qty INTEGER NOT NULL CHECK (qty > 0),
      PRIMARY KEY (sale_id, batch_id)
    );

    CREATE INDEX IF NOT EXISTS idx_sale_batch_allocations_batch
      ON sale_batch_allocations (batch_id);

    CREATE TABLE IF NOT EXISTS backup_history (
      file_name TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      mode TEXT NOT NULL CHECK (mode IN ('MANUAL', 'SCHEDULED')),
      verified INTEGER NOT NULL CHECK (verified IN (0, 1))
    );

    INSERT INTO stock_batches (
      product_id, source_type, source_id, qty_received, qty_remaining, expiry_date, unit_cost, created_at
    )
    SELECT id, 'LEGACY', NULL, stock_qty, stock_qty, NULL, cost_price, created_at
    FROM products
    WHERE stock_qty > 0;
  `,
}
