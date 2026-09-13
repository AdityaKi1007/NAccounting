/* eslint-disable */
exports.shorthands = undefined;

// Backs the new "Import" nav item (Home ... Documents, Import) — a bulk Excel importer for
// Invoices, Sales Orders, Receipts, Customers and Vendors, with a persistent per-row log of
// what happened on each import run (per the account owner's explicit choice: failed rows are
// "logged under a logger object" rather than only shown once in the response and lost).
//
// import_logs is one row per import run (one file uploaded and processed); import_log_rows is
// one row per spreadsheet row in that run, always written — for both a successful row (so
// there's a full audit trail of what got created and from which row) and a failed one (with
// the reason, and the original row's raw values so the user can fix and re-upload just those).
exports.up = (pgm) => {
  pgm.createTable('import_logs', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    organization_id: { type: 'uuid', notNull: true, references: 'organizations', onDelete: 'cascade' },
    entity: { type: 'text', notNull: true }, // invoices | sales-orders | receipts | customers | vendors
    file_name: { type: 'text' },
    total_rows: { type: 'integer', notNull: true, default: 0 },
    success_count: { type: 'integer', notNull: true, default: 0 },
    failure_count: { type: 'integer', notNull: true, default: 0 },
    created_by: { type: 'uuid', references: 'users', onDelete: 'set null' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('import_logs', ['organization_id', 'entity', 'created_at']);

  pgm.createTable('import_log_rows', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    import_log_id: { type: 'uuid', notNull: true, references: 'import_logs', onDelete: 'cascade' },
    row_number: { type: 'integer', notNull: true },
    status: { type: 'text', notNull: true }, // 'success' | 'failed'
    error_message: { type: 'text' },
    row_data: { type: 'jsonb', notNull: true, default: '{}' },
    created_record_id: { type: 'uuid' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('import_log_rows', 'import_log_id');
};

exports.down = (pgm) => {
  pgm.dropTable('import_log_rows');
  pgm.dropTable('import_logs');
};
