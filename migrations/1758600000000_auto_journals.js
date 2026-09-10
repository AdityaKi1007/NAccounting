/* eslint-disable */
exports.shorthands = undefined;

// Backing for auto-generated journal entries (see src/lib/auto-journal.ts): whenever an
// invoice moves out of Draft/Void, or a payment is saved as Paid, the app now posts (and
// keeps in sync) a real double-entry journal for it, reusing the existing manual_journals /
// journal_lines tables rather than a parallel structure. invoice_id / payment_id are how a
// sync pass finds "the journal for this document" to replace, and ON DELETE CASCADE means
// deleting the invoice/payment cleans up its journal for free.
//
// Two other gaps this closes, both needed for the payment side of that journal to balance:
//   - bank_accounts (Petty Cash, etc.) had no counterpart in the real chart of accounts
//     (`accounts`), so there was nothing to debit for money received into one. gl_account_id
//     links each bank account to its GL account; auto-journal.ts lazily creates+links one for
//     any bank account that doesn't have it yet (covers accounts created before this
//     migration, and any created by hand going forward without going through provisioning).
//   - a payment can receive more than it applies to invoices (an advance/excess) or carry a
//     bank charge, and neither had a home in the chart of accounts. "Unearned Revenue" and
//     "Bank Charges" are backfilled onto every existing organization below, and added to
//     DEFAULT_ACCOUNTS in org-provisioning.ts for organizations created from here on.
exports.up = (pgm) => {
  pgm.addColumns('manual_journals', {
    invoice_id: { type: 'uuid', references: 'invoices', onDelete: 'cascade' },
    payment_id: { type: 'uuid', references: 'payments_received', onDelete: 'cascade' },
  });
  pgm.createIndex('manual_journals', 'invoice_id', {
    name: 'manual_journals_invoice_id_unique',
    unique: true,
    where: 'invoice_id IS NOT NULL',
  });
  pgm.createIndex('manual_journals', 'payment_id', {
    name: 'manual_journals_payment_id_unique',
    unique: true,
    where: 'payment_id IS NOT NULL',
  });

  pgm.addColumns('bank_accounts', {
    gl_account_id: { type: 'uuid', references: 'accounts', onDelete: 'set null' },
  });

  pgm.sql(`
    INSERT INTO accounts (organization_id, code, name, type)
    SELECT o.id, '2020', 'Unearned Revenue', 'other_current_liability'
    FROM organizations o
    WHERE NOT EXISTS (
      SELECT 1 FROM accounts a WHERE a.organization_id = o.id AND a.name = 'Unearned Revenue'
    );
  `);
  pgm.sql(`
    INSERT INTO accounts (organization_id, code, name, type)
    SELECT o.id, '5060', 'Bank Charges', 'expense'
    FROM organizations o
    WHERE NOT EXISTS (
      SELECT 1 FROM accounts a WHERE a.organization_id = o.id AND a.name = 'Bank Charges'
    );
  `);
};

exports.down = (pgm) => {
  pgm.dropColumns('bank_accounts', ['gl_account_id']);
  pgm.dropIndex('manual_journals', 'invoice_id', { name: 'manual_journals_invoice_id_unique' });
  pgm.dropIndex('manual_journals', 'payment_id', { name: 'manual_journals_payment_id_unique' });
  pgm.dropColumns('manual_journals', ['invoice_id', 'payment_id']);
};
