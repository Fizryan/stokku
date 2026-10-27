import type { DatabaseMigration } from './001_initial_schema.js'

export const migration004CustomersAndLoyalty: DatabaseMigration = {
  version: 4,
  name: '004_customers_and_loyalty',
  sql: `
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      email TEXT,
      address TEXT,
      notes TEXT,
      points_balance INTEGER NOT NULL DEFAULT 0 CHECK (points_balance >= 0),
      total_spend INTEGER NOT NULL DEFAULT 0 CHECK (total_spend >= 0),
      visit_count INTEGER NOT NULL DEFAULT 0 CHECK (visit_count >= 0),
      is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_customers_phone
      ON customers (phone);

    CREATE INDEX IF NOT EXISTS idx_customers_name
      ON customers (name COLLATE NOCASE);

    CREATE INDEX IF NOT EXISTS idx_customers_points
      ON customers (points_balance DESC);

    CREATE INDEX IF NOT EXISTS idx_customers_spend
      ON customers (total_spend DESC);

    CREATE TABLE IF NOT EXISTS customer_point_mutations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      points INTEGER NOT NULL,
      mutation_type TEXT NOT NULL CHECK (mutation_type IN ('EARNED', 'REDEEMED', 'VOID_REVERSED', 'VOID_RESTORED', 'ADJUSTMENT')),
      reference_type TEXT NOT NULL CHECK (reference_type IN ('SALE', 'MANUAL')),
      reference_id INTEGER,
      description TEXT NOT NULL,
      actor_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_customer_point_mutations_cust_created
      ON customer_point_mutations (customer_id, created_at DESC, id DESC);

    ALTER TABLE sales ADD COLUMN customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL;
    ALTER TABLE sales ADD COLUMN points_earned INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE sales ADD COLUMN points_redeemed INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE sales ADD COLUMN points_discount_amount INTEGER NOT NULL DEFAULT 0;

    CREATE INDEX IF NOT EXISTS idx_sales_customer
      ON sales (customer_id, created_at DESC);
  `,
}
