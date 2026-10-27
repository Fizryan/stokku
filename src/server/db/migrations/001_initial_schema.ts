export interface DatabaseMigration {
  readonly version: number
  readonly name: string
  readonly sql: string
}

export const migration001InitialSchema: DatabaseMigration = {
  version: 1,
  name: '001_initial_schema',
  sql: `
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('OWNER', 'WAREHOUSE', 'CASHIER')),
      is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_users_role_active
      ON users (role, is_active);

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user_id
      ON sessions (user_id);

    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at
      ON sessions (expires_at);

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      description TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku TEXT NOT NULL UNIQUE,
      barcode TEXT UNIQUE,
      name TEXT NOT NULL,
      category_id INTEGER REFERENCES categories(id) ON DELETE RESTRICT,
      unit TEXT NOT NULL,
      cost_price INTEGER NOT NULL CHECK (cost_price >= 0),
      sell_price INTEGER NOT NULL CHECK (sell_price >= 0),
      stock_qty INTEGER NOT NULL DEFAULT 0 CHECK (stock_qty >= 0),
      min_stock_qty INTEGER NOT NULL DEFAULT 0 CHECK (min_stock_qty >= 0),
      is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_products_category_active
      ON products (category_id, is_active);

    CREATE INDEX IF NOT EXISTS idx_products_active_stock
      ON products (is_active, stock_qty, min_stock_qty);

    CREATE INDEX IF NOT EXISTS idx_products_name
      ON products (name COLLATE NOCASE);

    CREATE TABLE IF NOT EXISTS stock_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      movement_type TEXT NOT NULL CHECK (
        movement_type IN (
          'INITIAL',
          'IN_PURCHASE',
          'OUT_SALE',
          'ADJUSTMENT_OPNAME',
          'OUT_DAMAGED',
          'VOID_REVERSAL'
        )
      ),
      qty_before INTEGER NOT NULL CHECK (qty_before >= 0),
      qty_change INTEGER NOT NULL,
      qty_after INTEGER NOT NULL CHECK (qty_after >= 0 AND qty_before + qty_change = qty_after),
      unit_cost_snapshot INTEGER CHECK (unit_cost_snapshot IS NULL OR unit_cost_snapshot >= 0),
      reference_type TEXT NOT NULL CHECK (reference_type IN ('INITIAL', 'MANUAL', 'SALE', 'VOID')),
      reference_id INTEGER,
      note TEXT,
      actor_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_stock_movements_product_created
      ON stock_movements (product_id, created_at DESC, id DESC);

    CREATE INDEX IF NOT EXISTS idx_stock_movements_created
      ON stock_movements (created_at DESC, id DESC);

    CREATE INDEX IF NOT EXISTS idx_stock_movements_type_created
      ON stock_movements (movement_type, created_at DESC);

    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT NOT NULL UNIQUE,
      cashier_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      customer_name TEXT,
      subtotal_amount INTEGER NOT NULL CHECK (subtotal_amount >= 0),
      discount_amount INTEGER NOT NULL DEFAULT 0 CHECK (
        discount_amount >= 0 AND discount_amount <= subtotal_amount
      ),
      total_amount INTEGER NOT NULL CHECK (
        total_amount >= 0 AND total_amount = subtotal_amount - discount_amount
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
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sales_created_status
      ON sales (created_at DESC, status);

    CREATE INDEX IF NOT EXISTS idx_sales_cashier_created
      ON sales (cashier_user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS sale_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      sku_snapshot TEXT NOT NULL,
      product_name_snapshot TEXT NOT NULL,
      unit_snapshot TEXT NOT NULL,
      qty INTEGER NOT NULL CHECK (qty > 0),
      cost_price_at_sale INTEGER NOT NULL CHECK (cost_price_at_sale >= 0),
      sell_price_at_sale INTEGER NOT NULL CHECK (sell_price_at_sale >= 0),
      line_subtotal INTEGER NOT NULL CHECK (
        line_subtotal >= 0 AND line_subtotal = qty * sell_price_at_sale
      )
    );

    CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id
      ON sale_items (sale_id);

    CREATE INDEX IF NOT EXISTS idx_sale_items_product_id
      ON sale_items (product_id);
  `,
}
