/* eslint-disable */
exports.shorthands = undefined;

// Data-only backfill, no schema change (bank_accounts.gl_account_id has existed since
// migrations/1758600000000_auto_journals.js). Every bank/credit-card account has always been
// SUPPOSED to have a real Chart of Accounts entry behind it, but the only place that link ever
// got created was lazily, the first time a payment/expense/refund posted against it
// (getOrCreateBankGLAccount in auto-journal.ts) — a bank account nobody had transacted through
// yet (or one that predates that migration entirely, e.g. the org-provisioning default) could
// sit with gl_account_id NULL indefinitely. That's exactly what let a user create a *second*,
// disconnected Chart of Accounts entry by hand for the same real-world bank account, not
// realizing the Banking-module one had no GL entry to find in the first place — see the
// "Banking list + GL relation" fix this migration ships alongside (entities.ts's new
// bank-accounts.gl_account_id field, and the eager-link calls in
// src/app/api/entities/[entity]/route.ts and [id]/route.ts).
//
// This closes the gap for every bank account that predates that fix: any bank_accounts row
// still missing a link gets a freshly created Chart of Accounts entry (typed 'bank' or
// 'credit_card' to match, same as the eager-link path), named after the bank account itself,
// so "Amount in Books" on the redesigned Banking list has something real to compute from
// immediately, without waiting on that org's next transaction.
//
// Deliberately NOT a merge with any pre-existing, hand-created duplicate account of the same
// name (like the "Emirates NBD - Current" case that prompted this fix) — this migration can't
// safely guess which existing Chart of Accounts entry, if any, a person actually intended as
// "the real one" (there could be real transactions on either side), so it only fills in the
// gap for bank accounts with no GL link at all. Reconciling a specific known duplicate is a
// manual, one-off fix (see the project addendum for this feature), not something this
// migration attempts automatically.
exports.up = async (pgm) => {
  const rows = await pgm.db.select(
    `SELECT id, organization_id, account_name, account_type FROM bank_accounts WHERE gl_account_id IS NULL`
  );
  for (const row of rows) {
    const glType = row.account_type === "credit_card" ? "credit_card" : "bank";
    const created = await pgm.db.select(
      `INSERT INTO accounts (organization_id, name, type) VALUES ($1, $2, $3) RETURNING id`,
      [row.organization_id, row.account_name, glType]
    );
    await pgm.db.query(`UPDATE bank_accounts SET gl_account_id = $1 WHERE id = $2`, [created[0].id, row.id]);
  }
};

// Not reversed — the accounts this created may by now carry real journal_lines (any payment
// posted against that bank account since this ran), so blindly deleting them on `down` could
// destroy real ledger data. Leaves the created Chart of Accounts entries and links in place,
// same call as every other backfill-style migration in this codebase makes implicitly by not
// bothering to reverse pure data seeding (see e.g. 1757700000000_roles.js/DEFAULT_ROLES).
exports.down = () => {};
