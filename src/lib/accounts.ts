// Maps the detailed Account Type stored on accounts.type (see ACCOUNT_TYPE_OPTIONS in
// entities.ts) back to its top-level accounting category, so pages like the account
// detail view know which side (debit or credit) is that account's "normal" balance
// without needing a second column on the table. Legacy coarse values ("asset",
// "liability", ...) are kept mapped too, since they can still exist on rows created
// before the detailed type list existed and before the backfill migration runs.
const ACCOUNT_CATEGORY: Record<string, "asset" | "liability" | "equity" | "income" | "expense"> = {
  other_asset: "asset",
  other_current_asset: "asset",
  cash: "asset",
  bank: "asset",
  fixed_asset: "asset",
  accounts_receivable: "asset",
  stock: "asset",
  payment_clearing_account: "asset",
  intangible_asset: "asset",
  non_current_asset: "asset",
  deferred_tax_asset: "asset",
  capital_work_in_progress: "asset",
  intangible_assets_under_development: "asset",

  other_current_liability: "liability",
  credit_card: "liability",
  non_current_liability: "liability",
  other_liability: "liability",
  accounts_payable: "liability",
  deferred_tax_liability: "liability",

  equity: "equity",

  income: "income",
  other_income: "income",

  expense: "expense",
  cost_of_goods_sold: "expense",
  other_expense: "expense",

  // pre-migration legacy values
  asset: "asset",
  liability: "liability",
};

export function accountCategory(type: string) {
  return ACCOUNT_CATEGORY[type] ?? "asset";
}

/** Assets and expenses normally carry a debit balance; liabilities, equity and income a credit one. */
export function normalBalanceSide(type: string): "debit" | "credit" {
  const category = accountCategory(type);
  return category === "asset" || category === "expense" ? "debit" : "credit";
}

/**
 * Nets a set of debit/credit totals into a single signed closing balance, labeled the way
 * Zoho Books labels it: shown as a positive number with "(Dr)" or "(Cr)" depending on
 * which side the balance actually sits on, not which side is "normal" for the account.
 */
export function closingBalance(totalDebit: number, totalCredit: number) {
  const net = totalDebit - totalCredit;
  return {
    amount: Math.abs(net),
    side: net >= 0 ? ("debit" as const) : ("credit" as const),
  };
}
