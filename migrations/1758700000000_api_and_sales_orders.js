/* eslint-disable */
exports.shorthands = undefined;

// Two additions for the third-party REST API + Sales Orders feature:
//
//   - api_keys: organization-scoped API keys for the new /api/v1/* routes. Only a sha256
//     hash of the key is ever stored (key_hash, unique) — the raw key is shown to the user
//     once at creation time and never again. key_prefix keeps the first few characters
//     around (unhashed) purely so the management UI can show "nz_live_a1b2••••" without
//     re-deriving anything from the hash.
//   - sales_orders / sales_order_items: a genuinely new document type (Zoho's "Sales
//     Orders"), modeled directly on quotes/quote_items since the shape (party, date range,
//     status, line items, subtotal/tax/total) is identical. Registered in
//     src/lib/documents.ts + src/lib/entities.ts, which is enough to get full generic
//     UI + /api/documents/sales-orders CRUD for free — see the generic [slug] app routes.
exports.up = (pgm) => {
  pgm.createTable('api_keys', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    organization_id: { type: 'uuid', notNull: true, references: 'organizations', onDelete: 'cascade' },
    name: { type: 'text', notNull: true },
    key_prefix: { type: 'text', notNull: true },
    key_hash: { type: 'text', notNull: true },
    created_by: { type: 'uuid', references: 'users', onDelete: 'set null' },
    is_active: { type: 'boolean', notNull: true, default: true },
    last_used_at: { type: 'timestamptz' },
    request_count: { type: 'integer', notNull: true, default: 0 },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('api_keys', 'organization_id');
  pgm.createIndex('api_keys', 'key_hash', { unique: true });

  pgm.createTable('sales_orders', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    organization_id: { type: 'uuid', notNull: true, references: 'organizations', onDelete: 'cascade' },
    so_number: { type: 'text', notNull: true },
    customer_id: { type: 'uuid', references: 'customers', onDelete: 'set null' },
    order_date: { type: 'date', notNull: true, default: pgm.func('current_date') },
    shipment_date: { type: 'date' },
    status: { type: 'text', notNull: true, default: 'draft' }, // draft|confirmed|closed|void
    subtotal: { type: 'numeric', notNull: true, default: 0 },
    tax_total: { type: 'numeric', notNull: true, default: 0 },
    total: { type: 'numeric', notNull: true, default: 0 },
    notes: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createTable('sales_order_items', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    sales_order_id: { type: 'uuid', notNull: true, references: 'sales_orders', onDelete: 'cascade' },
    item_id: { type: 'uuid', references: 'items', onDelete: 'set null' },
    description: { type: 'text' },
    quantity: { type: 'numeric', notNull: true, default: 1 },
    rate: { type: 'numeric', notNull: true, default: 0 },
    amount: { type: 'numeric', notNull: true, default: 0 },
  });
  pgm.createIndex('sales_orders', 'organization_id');
};

exports.down = (pgm) => {
  pgm.dropTable('sales_order_items', { ifExists: true, cascade: true });
  pgm.dropTable('sales_orders', { ifExists: true, cascade: true });
  pgm.dropTable('api_keys', { ifExists: true, cascade: true });
};
