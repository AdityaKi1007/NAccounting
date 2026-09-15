/* eslint-disable */
exports.shorthands = undefined;

// "enable projects tagging on banks" — lets a bank/credit-card account be tagged to a
// Property Master Project, same reasoning already applied to Chart of Accounts' own
// project_id (migrations/1785000000000_chart_of_accounts_parent.js's sibling field, see
// entities.ts's "chart-of-accounts" comment: "a project-specific bank account" is the literal
// example given there). Most bank accounts are org-wide, not tied to any one project — this
// is optional, same as every other Property Master tag in this codebase (nullable,
// ON DELETE SET NULL, not CASCADE — a bank account's own history doesn't depend on the tagged
// project still existing).
//
// Deliberately independent of bank_accounts.gl_account_id's own linked Chart of Accounts
// entry, which can carry its own separate project_id — tagging the bank account here does not
// also tag (or require tagging) its auto-created/linked GL account; keeping the two in sync is
// out of scope for this pass.
exports.up = (pgm) => {
  pgm.addColumns("bank_accounts", {
    project_id: { type: "uuid", references: "projects", onDelete: "set null" },
  });
  pgm.createIndex("bank_accounts", "project_id");
};

exports.down = (pgm) => {
  pgm.dropColumns("bank_accounts", ["project_id"]);
};
