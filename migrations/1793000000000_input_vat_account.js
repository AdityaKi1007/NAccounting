/* eslint-disable */
exports.shorthands = undefined;

// Splits VAT into separate Input VAT (recoverable, an asset) and Output VAT (owed, a
// liability) accounts, instead of netting both through the single "VAT Payable" account —
// 2026-09-15: "why input vat entry is not shown" on an Expense's journal (the tax debit was
// posting into VAT Payable itself, same account Invoices credit for output tax, so it never
// showed as its own distinct "Input VAT" line) -> "yes keep both separate input and output
// vat".
//
// Design: a genuinely new "Input VAT" account (code 1030, type other_current_asset — a
// recoverable asset, not a liability), rather than renaming or repurposing "VAT Payable"
// (code 2010). "VAT Payable" keeps its existing name/code/type and becomes exclusively the
// Output VAT account from here on (Invoices/Credit Notes/Debit Notes — the sales side, which
// already only ever touched it in the output direction). Only the purchase side
// (Bills/Expenses/Vendor Credits — see auto-journal.ts's syncBillJournal/syncExpenseJournal/
// syncVendorCreditJournal) now resolves against this new account instead. Every account is
// still resolved generically by `type` (+ a "vat" name match) in auto-journal.ts's
// findAccountId — the two VAT accounts naturally disambiguate by type alone
// (other_current_asset vs other_current_liability), no special-casing needed. Backfilled onto
// every existing organization, same "backfill everyone, not just new orgs" convention as
// Deferred Revenue (1782000000000_revenue_recognition.js) and Opening Balance Adjustments
// before it — new orgs get it going forward via org-provisioning.ts's DEFAULT_ACCOUNTS.
exports.up = (pgm) => {
  pgm.sql(`
    INSERT INTO accounts (organization_id, code, name, type)
    SELECT id, '1030', 'Input VAT', 'other_current_asset'
    FROM organizations o
    WHERE NOT EXISTS (
      SELECT 1 FROM accounts a WHERE a.organization_id = o.id AND a.name = 'Input VAT'
    )
  `);

  // Self-heal a real, pre-existing case found while testing this migration: at least one
  // organization already has an account literally named "Input VAT" (created by hand, not by
  // this app) but typed as `other_current_liability` instead of `other_current_asset` — the
  // INSERT above correctly skipped it (matched by name, so no duplicate), but auto-journal.ts's
  // findAccountId resolves Input VAT strictly by `type = other_current_asset`, so a wrongly-
  // typed one would silently never be found and Bills/Expenses/Vendor Credits with tax would
  // start posting nothing for that org. Only corrects the type — code/name/balance untouched —
  // and only when the account has zero journal history (a real, already-posted VAT entry under
  // a "wrong" type is a bigger discrepancy than this migration should silently rewrite; that
  // case is left alone for a human to look at rather than guessed at).
  pgm.sql(`
    UPDATE accounts a
    SET type = 'other_current_asset'
    WHERE a.name = 'Input VAT'
      AND a.type <> 'other_current_asset'
      AND NOT EXISTS (SELECT 1 FROM journal_lines jl WHERE jl.account_id = a.id)
  `);
};

exports.down = (pgm) => {
  // Deliberately NOT removing the backfilled "Input VAT" accounts, and deliberately NOT
  // touching any journal_lines already posted against one — same convention as every other
  // data backfill in this codebase (irreversible seed, not schema). A rollback of this
  // migration just stops NEW purchase-side documents from resolving a distinct Input VAT
  // account (application code, not this migration, decides that) — it does not undo history.
};
