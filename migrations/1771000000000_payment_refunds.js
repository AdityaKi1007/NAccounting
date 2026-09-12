/* eslint-disable */
exports.shorthands = undefined;

// Backs the "Refund" action on a Paid Payment Received (Zoho calls this "Excess Amount
// Refund" from the customer receipt's own detail view) — refunding money the customer
// overpaid, whatever part of it was never applied to an invoice. A receipt can be refunded
// more than once (partial refunds over time), so this is its own child table rather than a
// single column on payments_received, the same way payment_allocations already is.
// `refund_type` is kept as free text (not an enum) with a single value written today
// ('excess_amount') so a future refund type doesn't need a schema migration to add — but the
// UI only offers Excess Amount Refund for now, since this app has no retainer/advance-payment
// concept the way Zoho's other refund types assume.
//
// ON DELETE CASCADE on payment_received_id: a refund is a child record fully owned by its
// receipt (like payment_allocations), not an independent document — deleting the receipt
// deletes its refund history and the refund's own journal (via manual_journals.
// payment_refund_id, also CASCADE) along with it.
exports.up = (pgm) => {
  pgm.createTable('payment_refunds', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    organization_id: { type: 'uuid', notNull: true, references: 'organizations', onDelete: 'cascade' },
    payment_received_id: { type: 'uuid', notNull: true, references: 'payments_received', onDelete: 'cascade' },
    refund_type: { type: 'text', notNull: true, default: 'excess_amount' },
    amount: { type: 'numeric', notNull: true },
    refunded_on: { type: 'date', notNull: true, default: pgm.func('current_date') },
    payment_mode: { type: 'text', notNull: true, default: 'cash' },
    from_account_id: { type: 'uuid', references: 'bank_accounts', onDelete: 'set null' },
    reference_number: { type: 'text' },
    description: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('payment_refunds', 'payment_received_id');
  pgm.createIndex('payment_refunds', 'organization_id');

  // Same one-journal-per-document pattern every other auto-journal link column already uses
  // (see migrations/1758600000000_auto_journals.js and friends) — a refund's journal is keyed
  // by payment_refund_id, unique when set, cascade-deleted with either the refund itself or
  // (transitively) the receipt it belongs to.
  pgm.addColumns('manual_journals', {
    payment_refund_id: { type: 'uuid', references: 'payment_refunds', onDelete: 'cascade' },
  });
  pgm.createIndex('manual_journals', 'payment_refund_id', {
    name: 'manual_journals_payment_refund_id_unique',
    unique: true,
    where: 'payment_refund_id IS NOT NULL',
  });
};

exports.down = (pgm) => {
  pgm.dropIndex('manual_journals', 'payment_refund_id', { name: 'manual_journals_payment_refund_id_unique' });
  pgm.dropColumns('manual_journals', ['payment_refund_id']);
  pgm.dropTable('payment_refunds');
};
