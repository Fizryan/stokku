import type { DatabaseMigration } from './001_initial_schema.js'

export const migration003PurchasesAndSuppliers: DatabaseMigration = {
  version: 3,
  name: '003_purchases_and_suppliers',
  sql: `
    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      contact_person TEXT,
      phone TEXT,
      address TEXT,
      notes TEXT,
      is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_suppliers_name
      ON suppliers (name);

    CREATE TABLE IF NOT EXISTS purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT NOT NULL UNIQUE,
      supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
      receiver_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      subtotal_amount INTEGER NOT NULL CHECK (subtotal_amount >= 0),
      payment_status TEXT NOT NULL CHECK (payment_status IN ('PAID', 'UNPAID')),
      due_date TEXT,
      notes TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_purchases_created
      ON purchases (created_at DESC, id DESC);

    CREATE INDEX IF NOT EXISTS idx_purchases_supplier
      ON purchases (supplier_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_purchases_payment_status
      ON purchases (payment_status, due_date ASC);

    CREATE TABLE IF NOT EXISTS purchase_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      sku_snapshot TEXT NOT NULL,
      product_name_snapshot TEXT NOT NULL,
      unit_snapshot TEXT NOT NULL,
      qty INTEGER NOT NULL CHECK (qty > 0),
      unit_cost INTEGER NOT NULL CHECK (unit_cost >= 0),
      line_subtotal INTEGER NOT NULL CHECK (line_subtotal = qty * unit_cost)
    );

    CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase
      ON purchase_items (purchase_id);

    CREATE INDEX IF NOT EXISTS idx_purchase_items_product
      ON purchase_items (product_id);
  `,
}
