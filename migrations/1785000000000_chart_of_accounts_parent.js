/* eslint-disable */
exports.shorthands = undefined;

// Chart of Accounts: parent/sub-account support ("Make this a sub-account" + a Parent Account
// column — requested against a Zoho Books reference screenshot showing both, neither of which
// existed anywhere in this codebase before this migration).
//
// Self-referencing FK on the same `accounts` table (mirrors how `projects.legal_entity_id`
// and every other optional "tag this record with a related record" field in this app is
// built — a plain nullable refEntity column, ON DELETE SET NULL since a sub-account's own
// history/usefulness doesn't depend on its parent still existing).
//
// Deliberately NOT enforced beyond "not its own parent" (see crud.ts's validateRefFields):
//   - No account-type matching between parent and sub-account (Zoho nudges toward matching
//     categories; this build doesn't check it — a user can build a mismatched hierarchy).
//   - No cycle detection beyond direct self-reference (A's parent = A). A deeper cycle
//     (A -> B -> C -> A) isn't rejected. Low risk in practice: nothing in this codebase walks
//     the parent chain recursively (no rollup logic reads it — see below), so a cycle can't
//     cause an infinite loop anywhere today; it would just be a confusing hierarchy to look at.
//   - No balance rollup. This column is a structural label only in this pass: Balance Sheet,
//     Trial Balance, and General Ledger all still list every account (parent and sub-account
//     alike) individually with its own balance, exactly as before. A sub-account's balance is
//     NOT added into its parent's total anywhere. Disclosed as a known limitation, not silently
//     implied to work like Zoho's own rollup.
exports.up = (pgm) => {
  pgm.addColumns("accounts", {
    parent_account_id: { type: "uuid", references: "accounts", onDelete: "set null" },
  });
  pgm.createIndex("accounts", "parent_account_id");
};

exports.down = (pgm) => {
  pgm.dropColumns("accounts", ["parent_account_id"]);
};
