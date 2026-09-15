/* eslint-disable */
exports.shorthands = undefined;

// "enable option for import statement next to Add Bank or Credit Card and include formats
// mentioned on the screenshot." The reference screenshot shows a 3-step wizard (Configure ->
// Map Fields -> Preview) accepting CSV/TSV/XLS/OFX/QIF/MT940/N43/CAMT.053/CAMT.054 (1MB) and
// PDF (5MB). Scoped down after asking: CSV/TSV/XLS/PDF get real, working parsers; the other
// formats are shown as options (to match the reference UI) but rejected with a clear
// "not yet supported" message rather than silently mis-parsing a complex banking-interchange
// format nobody validated against real sample files. See src/lib/statement-import.ts.
//
// Imported rows land in a staging table (not straight into Expenses/Receipts) so nothing hits
// the books un-reviewed — the user picks a Chart of Accounts category per row and posts it
// (see src/app/api/banking/statement-imports/[id]/post/route.ts), which creates an ordinary
// manual_journals + journal_lines pair, same mechanism every other auto-posted document in
// this app already uses (see auto-journal.ts).
exports.up = (pgm) => {
  // One row per completed import run — lets "Imported Transactions" show which file/batch a
  // staged row came from, and lets a whole bad import be identified at a glance (import_id),
  // even though rows are deleted/posted individually rather than as a batch.
  pgm.createTable('bank_statement_imports', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    organization_id: { type: 'uuid', notNull: true, references: 'organizations', onDelete: 'cascade' },
    bank_account_id: { type: 'uuid', notNull: true, references: 'bank_accounts', onDelete: 'cascade' },
    file_name: { type: 'text' },
    file_format: { type: 'text', notNull: true }, // csv | tsv | xls | pdf
    total_rows: { type: 'integer', notNull: true, default: 0 },
    imported_by: { type: 'uuid', references: 'users', onDelete: 'set null' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('bank_statement_imports', ['organization_id', 'bank_account_id']);

  pgm.createTable('imported_bank_transactions', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    organization_id: { type: 'uuid', notNull: true, references: 'organizations', onDelete: 'cascade' },
    import_id: { type: 'uuid', notNull: true, references: 'bank_statement_imports', onDelete: 'cascade' },
    bank_account_id: { type: 'uuid', notNull: true, references: 'bank_accounts', onDelete: 'cascade' },
    txn_date: { type: 'date', notNull: true },
    description: { type: 'text', notNull: true, default: '' },
    reference: { type: 'text' },
    amount: { type: 'numeric', notNull: true }, // always positive; direction carries the sign
    direction: { type: 'text', notNull: true }, // 'in' (deposit/money in) | 'out' (withdrawal/money out)
    // pending = staged, awaiting review; posted = a manual journal was created from it;
    // ignored = reviewed and deliberately not posted (e.g. an opening-balance line, a
    // duplicate, a statement summary row that isn't a real transaction).
    status: { type: 'text', notNull: true, default: 'pending' },
    category_account_id: { type: 'uuid', references: 'accounts', onDelete: 'set null' },
    journal_id: { type: 'uuid', references: 'manual_journals', onDelete: 'set null' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('imported_bank_transactions', ['organization_id', 'bank_account_id', 'status']);
  pgm.createIndex('imported_bank_transactions', ['organization_id', 'txn_date', 'amount']); // duplicate-detection lookups
};

exports.down = (pgm) => {
  pgm.dropTable('imported_bank_transactions');
  pgm.dropTable('bank_statement_imports');
};
