/* eslint-disable */
exports.shorthands = undefined;

// Turns Credit Notes from a bare-bones "type a total and a reason" record into a real
// line-item document tied to a specific invoice (see src/lib/credit-debit-notes-api.ts),
// and adds a matching Debit Notes document for the opposite adjustment (correcting an
// under-billed invoice). Both are created only from an invoice's "..." menu, always require
// invoice_id, and their totals apply straight to that invoice's balance_due + post a GL
// journal in the same transaction — there's no separate "apply later" allocation step (an
// explicit, deliberate scope decision — see the AskUserQuestion answers this was built from).
exports.up = (pgm) => {
  pgm.addColumns('credit_notes', {
    invoice_id: { type: 'uuid', references: 'invoices', onDelete: 'set null' },
    subtotal: { type: 'numeric', notNull: true, default: 0 },
    tax_total: { type: 'numeric', notNull: true, default: 0 },
    reference_number: { type: 'text' },
  });
  pgm.createTable('credit_note_items', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    credit_note_id: { type: 'uuid', notNull: true, references: 'credit_notes', onDelete: 'cascade' },
    item_id: { type: 'uuid', references: 'items', onDelete: 'set null' },
    description: { type: 'text' },
    quantity: { type: 'numeric', notNull: true, default: 1 },
    rate: { type: 'numeric', notNull: true, default: 0 },
    amount: { type: 'numeric', notNull: true, default: 0 },
  });

  pgm.createTable('debit_notes', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    organization_id: { type: 'uuid', notNull: true, references: 'organizations', onDelete: 'cascade' },
    debit_note_number: { type: 'text', notNull: true },
    customer_id: { type: 'uuid', references: 'customers', onDelete: 'set null' },
    invoice_id: { type: 'uuid', references: 'invoices', onDelete: 'set null' },
    debit_note_date: { type: 'date', notNull: true, default: pgm.func('current_date') },
    status: { type: 'text', notNull: true, default: 'open' }, // open|void
    subtotal: { type: 'numeric', notNull: true, default: 0 },
    tax_total: { type: 'numeric', notNull: true, default: 0 },
    total: { type: 'numeric', notNull: true, default: 0 },
    reference_number: { type: 'text' },
    reason: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createTable('debit_note_items', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    debit_note_id: { type: 'uuid', notNull: true, references: 'debit_notes', onDelete: 'cascade' },
    item_id: { type: 'uuid', references: 'items', onDelete: 'set null' },
    description: { type: 'text' },
    quantity: { type: 'numeric', notNull: true, default: 1 },
    rate: { type: 'numeric', notNull: true, default: 0 },
    amount: { type: 'numeric', notNull: true, default: 0 },
  });
  pgm.createIndex('debit_notes', 'organization_id');
  pgm.createIndex('credit_notes', 'invoice_id');
  pgm.createIndex('debit_notes', 'invoice_id');

  // Same auto-journal linkage pattern as invoice_id/payment_id on manual_journals
  // (migrations/1758600000000_auto_journals.js) — one journal per credit/debit note, found
  // and replaced wholesale on every sync, cascade-deleted if the note itself is deleted.
  pgm.addColumns('manual_journals', {
    credit_note_id: { type: 'uuid', references: 'credit_notes', onDelete: 'cascade' },
    debit_note_id: { type: 'uuid', references: 'debit_notes', onDelete: 'cascade' },
  });
  pgm.createIndex('manual_journals', 'credit_note_id', {
    name: 'manual_journals_credit_note_id_unique',
    unique: true,
    where: 'credit_note_id IS NOT NULL',
  });
  pgm.createIndex('manual_journals', 'debit_note_id', {
    name: 'manual_journals_debit_note_id_unique',
    unique: true,
    where: 'debit_note_id IS NOT NULL',
  });
};

exports.down = (pgm) => {
  pgm.dropIndex('manual_journals', 'debit_note_id', { name: 'manual_journals_debit_note_id_unique' });
  pgm.dropIndex('manual_journals', 'credit_note_id', { name: 'manual_journals_credit_note_id_unique' });
  pgm.dropColumns('manual_journals', ['credit_note_id', 'debit_note_id']);
  pgm.dropTable('debit_note_items', { ifExists: true, cascade: true });
  pgm.dropTable('debit_notes', { ifExists: true, cascade: true });
  pgm.dropTable('credit_note_items', { ifExists: true, cascade: true });
  pgm.dropColumns('credit_notes', ['invoice_id', 'subtotal', 'tax_total', 'reference_number']);
};
