/* eslint-disable */
exports.shorthands = undefined;

// The Account Type dropdown used to offer only the 5 coarse buckets (asset, liability,
// equity, income, expense). It now offers Zoho's full detailed list (Cash, Bank, Fixed
// Asset, Accounts Receivable, Accounts Payable, Cost Of Goods Sold, ...), and accounts.type
// stores the detailed value directly rather than a bucket + separate detail column. This
// best-effort remaps existing rows (matched by name, same as the accounts these buckets
// were originally seeded for) so they still show a valid, sensible selection instead of a
// blank dropdown after the migration.

exports.up = (pgm) => {
  const renames = [
    ["asset", "%cash%", "cash"],
    ["asset", "%receivable%", "accounts_receivable"],
    ["asset", "%inventory%", "stock"],
    ["liability", "accounts payable", "accounts_payable"],
    ["income", "%other%", "other_income"],
    ["expense", "%cost of goods%", "cost_of_goods_sold"],
  ];
  for (const [oldType, namePattern, newType] of renames) {
    pgm.sql(`UPDATE accounts SET type = '${newType}' WHERE type = '${oldType}' AND name ILIKE '${namePattern}'`);
  }

  // Anything left on a coarse bucket falls back to that category's generic "Other ..." type.
  // (equity/income/expense rows not already renamed above just keep their bucket value, which
  // is already a valid detailed value: 'equity', 'income', and 'expense' are themselves entries
  // in ACCOUNT_TYPE_OPTIONS, so no further UPDATE is needed for those three buckets.)
  pgm.sql(`UPDATE accounts SET type = 'other_current_asset' WHERE type = 'asset'`);
  pgm.sql(`UPDATE accounts SET type = 'other_current_liability' WHERE type = 'liability'`);
};

exports.down = (pgm) => {
  // Coarsening back is lossy by nature (many detailed types map to one bucket); this
  // collapses everything back to the 5 original buckets on a best-effort basis.
  pgm.sql(`
    UPDATE accounts SET type = CASE
      WHEN type IN ('other_asset','other_current_asset','cash','bank','fixed_asset','accounts_receivable','stock',
                     'payment_clearing_account','intangible_asset','non_current_asset','deferred_tax_asset',
                     'capital_work_in_progress','intangible_assets_under_development') THEN 'asset'
      WHEN type IN ('other_current_liability','credit_card','non_current_liability','other_liability',
                     'accounts_payable','deferred_tax_liability') THEN 'liability'
      WHEN type = 'equity' THEN 'equity'
      WHEN type IN ('income','other_income') THEN 'income'
      WHEN type IN ('expense','cost_of_goods_sold','other_expense') THEN 'expense'
      ELSE type
    END
  `);
};
