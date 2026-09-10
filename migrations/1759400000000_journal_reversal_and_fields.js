/* eslint-disable */
exports.shorthands = undefined;

// Rebuilds the New Journal page to match Zoho's real layout (Reverse Journal Date, Reporting
// Method, Currency, a per-line Contact) and makes "Reverse Journal Date" a real feature: on
// save, a *second*, fully materialized manual_journals row is created — the exact mirror of
// the original (debit/credit swapped on every line), dated on the reverse date. It's a real,
// independently-numbered, independently-editable journal, linked back via reversed_journal_id
// so it can be found/replaced again the next time the original is saved (see
// src/lib/journal-reversals.ts's syncJournalReversal — the same "sync on every save" shape
// auto-journal.ts already uses for invoices/bills/etc., just self-referential this time).
exports.up = (pgm) => {
  pgm.addColumns('manual_journals', {
    // Optional. When set (and the journal is Published), a mirror-image reversing journal is
    // kept in sync, dated here.
    reverse_journal_date: { type: 'date' },
    // The "Publish reverse journal only on the reverse journal date" checkbox. false (default,
    // unchecked) publishes the reversing journal immediately, just dated in the future — a
    // normal, already-posted entry that simply won't affect any report whose range/as-of
    // predates it. true (checked) keeps the reversing journal as Draft until that calendar
    // date actually arrives, at which point it's auto-published — see
    // processDueJournalReversals, called from every place that reads the ledger.
    reverse_only_on_date: { type: 'boolean', notNull: true, default: false },
    // Matches the screenshot's radio group. Stored for completeness, but disclosed limitation:
    // this build's reports (Profit and Loss, Balance Sheet, Cash Flow) are accrual-only — there
    // is no cash-basis reporting mode anywhere in this app, so choosing "Cash Only" here doesn't
    // change which reports this journal appears in. Not fixed in this pass.
    reporting_method: { type: 'text', notNull: true, default: 'accrual_and_cash' }, // accrual_and_cash | accrual_only | cash_only
    // Optional display currency for the journal header. Disclosed limitation: like the rest of
    // this app, there's no currency conversion — amounts are always entered and posted in the
    // org's base currency regardless of what's picked here.
    currency_code: { type: 'text' },
    // Set ONLY on an auto-generated reversing journal, pointing back at the original it
    // reverses. ON DELETE CASCADE: deleting the original takes its reversal with it (the
    // reversal has no independent reason to exist once the journal it mirrors is gone) — same
    // reasoning as every other manual_journals link column (invoice_id, credit_note_id, ...).
    reversed_journal_id: { type: 'uuid', references: 'manual_journals', onDelete: 'cascade' },
  });
  pgm.createIndex('manual_journals', 'reversed_journal_id', {
    name: 'manual_journals_reversed_journal_id_unique',
    unique: true,
    where: 'reversed_journal_id IS NOT NULL',
  });

  pgm.addColumns('journal_lines', {
    // Optional per-line "Contact" tag (matches the screenshot's Contact column) — who this
    // line relates to, a customer or a vendor. Disclosed limitation: purely an informational
    // tag in this pass, same as vendor_credits' missing bill_id — nothing downstream (no
    // statement, no report) reads it yet.
    contact_type: { type: 'text' }, // 'customer' | 'vendor'
    contact_id: { type: 'uuid' }, // no FK constraint — points into either customers or vendors depending on contact_type
  });
};

exports.down = (pgm) => {
  pgm.dropColumns('journal_lines', ['contact_type', 'contact_id']);
  pgm.dropIndex('manual_journals', 'reversed_journal_id', { name: 'manual_journals_reversed_journal_id_unique' });
  pgm.dropColumns('manual_journals', [
    'reverse_journal_date',
    'reverse_only_on_date',
    'reporting_method',
    'currency_code',
    'reversed_journal_id',
  ]);
};
