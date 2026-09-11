/* eslint-disable */
exports.shorthands = undefined;

// Settings -> Setup & Configurations -> Opening Balances (matches the Zoho Books reference
// screenshot: a Migration Date, a Debit/Credit table grouped by Asset/Liability/Equity, an
// "Accounts Receivable" line aggregated from every customer's Opening Balance, an "Accounts
// Payable" line aggregated from every vendor's, and an auto-balancing "Opening Balance
// Adjustments" plug so the entry always balances without the user hand-computing it). The
// "opening-balances" settings slug already existed as a placeholder (src/lib/settings.ts) —
// this is what makes it real.
//
// Design:
//   - `account_opening_balances` holds one row per (org, account) for any directly-entered
//     Asset/Liability/Equity account balance — NOT Accounts Receivable/Accounts Payable
//     (those are derived live from customers.opening_balance/vendors.opening_balance, the
//     same per-customer/per-vendor field the app already captures but has never used for
//     anything, and NOT Income/Expense accounts, which Zoho's own Opening Balances feature
//     doesn't cover either.
//   - `vendors.opening_balance` is new — customers already had this column
//     (1757100000000_customer_detail_fields.js) but vendors never got the matching one, so
//     there was no way to aggregate an Accounts Payable opening balance at all until now.
//   - `manual_journals.is_opening_balance` + a partial unique index is this feature's version
//     of the link-column-per-document-type convention every other auto-journal uses
//     (invoice_id, bill_id, ...) — there's no single row to point a FK at here (it's an
//     org-wide consolidated entry, not a per-document one), so a boolean flag + the existing
//     organization_id column stands in for that FK, enforced unique the same way.
exports.up = (pgm) => {
  pgm.addColumns("organizations", {
    opening_balance_migration_date: { type: "date" },
  });

  pgm.addColumns("vendors", {
    opening_balance: { type: "numeric", notNull: true, default: 0 },
  });

  pgm.createTable("account_opening_balances", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    organization_id: { type: "uuid", notNull: true, references: "organizations", onDelete: "cascade" },
    account_id: { type: "uuid", notNull: true, references: "accounts", onDelete: "cascade" },
    debit: { type: "numeric", notNull: true, default: 0 },
    credit: { type: "numeric", notNull: true, default: 0 },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.addConstraint("account_opening_balances", "account_opening_balances_org_account_uq", {
    unique: ["organization_id", "account_id"],
  });
  pgm.createIndex("account_opening_balances", "organization_id");

  pgm.addColumns("manual_journals", {
    is_opening_balance: { type: "boolean", notNull: true, default: false },
  });
  pgm.sql(`
    CREATE UNIQUE INDEX manual_journals_org_opening_balance_uq
    ON manual_journals (organization_id) WHERE is_opening_balance = true
  `);

  // Backfill so every existing org already has the plug account this feature posts against —
  // same "backfill everyone, not just new orgs" convention as the 2026-09-10 Tax Rates
  // migration. Idempotent: skips any org that (implausibly) already has an account with this
  // exact name, e.g. from a re-run.
  pgm.sql(`
    INSERT INTO accounts (organization_id, code, name, type)
    SELECT id, '2030', 'Opening Balance Adjustments', 'other_current_liability'
    FROM organizations o
    WHERE NOT EXISTS (
      SELECT 1 FROM accounts a WHERE a.organization_id = o.id AND a.name = 'Opening Balance Adjustments'
    )
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP INDEX IF EXISTS manual_journals_org_opening_balance_uq`);
  pgm.dropColumns("manual_journals", ["is_opening_balance"]);
  pgm.dropTable("account_opening_balances");
  pgm.dropColumns("vendors", ["opening_balance"]);
  pgm.dropColumns("organizations", ["opening_balance_migration_date"]);
  // Deliberately NOT removing the backfilled "Opening Balance Adjustments" accounts — same
  // convention as every other data backfill in this codebase (irreversible seed, not schema).
};
