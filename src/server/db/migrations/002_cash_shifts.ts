import type { DatabaseMigration } from './001_initial_schema.js'

export const migration002CashShifts: DatabaseMigration = {
  version: 2,
  name: '002_cash_shifts',
  sql: `
    CREATE TABLE IF NOT EXISTS cash_shifts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cashier_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      opened_at TEXT NOT NULL,
      closed_at TEXT,
      opening_cash INTEGER NOT NULL CHECK (opening_cash >= 0),
      closing_cash INTEGER CHECK (closing_cash IS NULL OR closing_cash >= 0),
      expected_cash INTEGER CHECK (expected_cash IS NULL OR expected_cash >= 0),
      cash_difference INTEGER,
      status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),
      notes TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_cash_shifts_cashier_status
      ON cash_shifts (cashier_user_id, status);

    CREATE INDEX IF NOT EXISTS idx_cash_shifts_opened_at
      ON cash_shifts (opened_at DESC, id DESC);

    CREATE TABLE IF NOT EXISTS cash_shift_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shift_id INTEGER NOT NULL REFERENCES cash_shifts(id) ON DELETE CASCADE,
      movement_type TEXT NOT NULL CHECK (movement_type IN ('CASH_IN', 'CASH_OUT')),
      amount INTEGER NOT NULL CHECK (amount > 0),
      reason TEXT NOT NULL,
      actor_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_cash_shift_movements_shift
      ON cash_shift_movements (shift_id, created_at ASC);

    ALTER TABLE sales ADD COLUMN shift_id INTEGER REFERENCES cash_shifts(id) ON DELETE RESTRICT;

    CREATE INDEX IF NOT EXISTS idx_sales_shift_id
      ON sales (shift_id);
  `,
}
