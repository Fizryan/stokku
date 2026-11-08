import type { DatabaseMigration } from './001_initial_schema.js'

export const migration007SalesTax: DatabaseMigration = {
  version: 7,
  name: '007_sales_tax',
  sql: `
    -- SQLite cannot ALTER or DROP a CHECK constraint, so the sales table
    -- must be rebuilt with the new tax_amount column and updated total CHECK.
    CREATE TABLE sales_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT NOT NULL UNIQUE,
      cashier_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      customer_name TEXT,
      customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      points_earned INTEGER NOT NULL DEFAULT 0,
      points_redeemed INTEGER NOT NULL DEFAULT 0,
      points_discount_amount INTEGER NOT NULL DEFAULT 0,
      subtotal_amount INTEGER NOT NULL CHECK (subtotal_amount >= 0),
      discount_amount INTEGER NOT NULL DEFAULT 0 CHECK (
        discount_amount >= 0 AND discount_amount <= subtotal_amount
      ),
      tax_amount INTEGER NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
      total_amount INTEGER NOT NULL CHECK (
        total_amount >= 0 AND total_amount = subtotal_amount - discount_amount + tax_amount
      ),
      payment_method TEXT NOT NULL CHECK (payment_method IN ('CASH', 'QRIS', 'TRANSFER')),
      paid_amount INTEGER NOT NULL CHECK (paid_amount >= total_amount),
      change_amount INTEGER NOT NULL CHECK (
        change_amount >= 0 AND change_amount = paid_amount - total_amount
      ),
      status TEXT NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('COMPLETED', 'VOIDED')),
      void_reason TEXT,
      voided_by_user_id INTEGER REFERENCES users(id) ON DELETE RESTRICT,
      voided_at TEXT,
      shift_id INTEGER NOT NULL REFERENCES cash_shifts(id) ON DELETE RESTRICT,
      created_at TEXT NOT NULL
    );

    INSERT INTO sales_new (
      id,
      invoice_number,
      cashier_user_id,
      customer_name,
      customer_id,
      points_earned,
      points_redeemed,
      points_discount_amount,
      subtotal_amount,
      discount_amount,
      tax_amount,
      total_amount,
      payment_method,
      paid_amount,
      change_amount,
      status,
      void_reason,
      voided_by_user_id,
      voided_at,
      shift_id,
      created_at
    )
    SELECT
      id,
      invoice_number,
      cashier_user_id,
      customer_name,
      customer_id,
      points_earned,
      points_redeemed,
      points_discount_amount,
      subtotal_amount,
      discount_amount,
      0 AS tax_amount,
      total_amount,
      payment_method,
      paid_amount,
      change_amount,
      status,
      void_reason,
      voided_by_user_id,
      voided_at,
      shift_id,
      created_at
    FROM sales;

    DROP TABLE sales;
    ALTER TABLE sales_new RENAME TO sales;

    CREATE INDEX IF NOT EXISTS idx_sales_created_status
      ON sales (created_at DESC, status);

    CREATE INDEX IF NOT EXISTS idx_sales_cashier_created
      ON sales (cashier_user_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_sales_customer
      ON sales (customer_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_sales_shift_id
      ON sales (shift_id);
  `,
}
