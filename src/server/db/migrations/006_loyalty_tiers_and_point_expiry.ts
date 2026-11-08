import type { DatabaseMigration } from './001_initial_schema.js'

export const migration006LoyaltyTiersAndPointExpiry: DatabaseMigration = {
  version: 6,
  name: '006_loyalty_tiers_and_point_expiry',
  sql: `
    CREATE TABLE customer_point_mutations_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      points INTEGER NOT NULL,
      mutation_type TEXT NOT NULL CHECK (mutation_type IN (
        'EARNED', 'REDEEMED', 'VOID_REVERSED', 'VOID_RESTORED', 'ADJUSTMENT', 'EXPIRED'
      )),
      reference_type TEXT NOT NULL CHECK (reference_type IN ('SALE', 'MANUAL')),
      reference_id INTEGER,
      description TEXT NOT NULL,
      actor_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at TEXT NOT NULL,
      expires_at TEXT
    );

    INSERT INTO customer_point_mutations_new (
      id, customer_id, points, mutation_type, reference_type, reference_id,
      description, actor_user_id, created_at
    )
    SELECT
      id, customer_id, points, mutation_type, reference_type, reference_id,
      description, actor_user_id, created_at
    FROM customer_point_mutations;

    DROP TABLE customer_point_mutations;
    ALTER TABLE customer_point_mutations_new RENAME TO customer_point_mutations;

    CREATE INDEX idx_customer_point_mutations_cust_created
      ON customer_point_mutations (customer_id, created_at DESC, id DESC);

    CREATE TABLE customer_point_lots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      source_mutation_id INTEGER UNIQUE REFERENCES customer_point_mutations(id) ON DELETE RESTRICT,
      remaining_points INTEGER NOT NULL CHECK (remaining_points >= 0),
      expires_at TEXT NOT NULL
    );

    CREATE INDEX idx_customer_point_lots_customer_expiry
      ON customer_point_lots (customer_id, expires_at, id);

    CREATE TABLE customer_point_lot_allocations (
      mutation_id INTEGER NOT NULL REFERENCES customer_point_mutations(id) ON DELETE RESTRICT,
      lot_id INTEGER NOT NULL REFERENCES customer_point_lots(id) ON DELETE RESTRICT,
      points INTEGER NOT NULL CHECK (points > 0),
      PRIMARY KEY (mutation_id, lot_id)
    );

    INSERT INTO customer_point_lots (customer_id, source_mutation_id, remaining_points, expires_at)
    SELECT
      id,
      NULL,
      points_balance,
      strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+365 days')
    FROM customers
    WHERE points_balance > 0;
  `,
}
