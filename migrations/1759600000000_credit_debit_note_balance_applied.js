/* eslint-disable */
exports.shorthands = undefined;

// Fixes a real correctness bug found while testing the new standalone Credit Note entry
// point: voidCreditOrDebitNote() reversed a credit note by adding its full `total` back onto
// the invoice's balance_due, uncapped — but createCreditOrDebitNote() applies a credit note
// by SUBTRACTING it FLOORED AT 0. Whenever a credit note's total exceeds the invoice's
// balance_due at the moment it's created (e.g. crediting a customer's full original invoice
// amount after most of it has already been paid), only part of that total is actually
// removed from balance_due — but voiding the note later added the whole total back anyway,
// inflating balance_due past the invoice's own total and flipping its status back to
// "sent" even though most of it had genuinely been paid. Recorded live: a $525 invoice with
// balance_due=$25 (partially paid) went to balance_due=$525/status=sent after create-then-
// void of a $525 credit note, instead of correctly landing back at $25/partially_paid.
//
// Fix: record the amount ACTUALLY applied to balance_due at creation time (which can be less
// than the note's own `total`, for a credit note only — a debit note's create-time
// application is never clipped, so its balance_applied always just equals `total`), and have
// void() reverse by that recorded amount instead of by `total`. See credit-debit-notes-api.ts.
exports.up = (pgm) => {
  pgm.addColumns("credit_notes", {
    balance_applied: { type: "numeric", notNull: true, default: 0 },
  });
  pgm.addColumns("debit_notes", {
    balance_applied: { type: "numeric", notNull: true, default: 0 },
  });
  // Backfill existing rows so any note created before this migration reverses correctly too
  // (best-effort: assume no clipping happened historically, i.e. balance_applied = total —
  // true for every debit note always, and true for the vast majority of credit notes, which
  // is the most reasonable default for data that predates this fix).
  pgm.sql(`UPDATE credit_notes SET balance_applied = total WHERE balance_applied = 0 AND total <> 0`);
  pgm.sql(`UPDATE debit_notes SET balance_applied = total WHERE balance_applied = 0 AND total <> 0`);
};

exports.down = (pgm) => {
  pgm.dropColumns("credit_notes", ["balance_applied"]);
  pgm.dropColumns("debit_notes", ["balance_applied"]);
};
