import type { PoolClient } from "pg";
import { slugify } from "@/lib/ids";

// Shared by signup (new user + first org) and the "New Organization" flow (existing user
// adding another org) so both paths seed the exact same starter data — the settings pages
// for roles, currencies, payment terms and reminders all expect these rows to already
// exist, and chart-of-accounts expects the default accounts. Keep these lists in sync with
// whatever the corresponding settings pages assume is present.
export const DEFAULT_ROLES: { name: string; description: string }[] = [
  { name: "Admin", description: "Unrestricted access to all modules." },
  { name: "Staff", description: "Access to all modules except reports, settings and accounting." },
];

export const DEFAULT_CURRENCIES: { code: string; name: string; symbol: string }[] = [
  { code: "AUD", name: "Australian Dollar", symbol: "$" },
  { code: "BND", name: "Brunei Dollar", symbol: "$" },
  { code: "CAD", name: "Canadian Dollar", symbol: "$" },
  { code: "CNY", name: "Yuan Renminbi", symbol: "CNY" },
  { code: "EUR", name: "Euro", symbol: "€" },
  { code: "GBP", name: "British Pound", symbol: "£" },
  { code: "INR", name: "Indian Rupee", symbol: "₹" },
  { code: "JPY", name: "Japanese Yen", symbol: "¥" },
  { code: "SAR", name: "Saudi Riyal", symbol: "SAR" },
  { code: "USD", name: "US Dollar", symbol: "$" },
  { code: "ZAR", name: "South African Rand", symbol: "R" },
];

// Matches the two starter rows the 2026-09-10 migration backfilled onto every pre-existing
// organization (migrations/1759900000000_tax_rates_and_corporate_tax.js) — new orgs and
// existing orgs both end up with the same Tax Rates list rather than a new org seeing an
// empty table. 5% is also this app's existing hardcoded document-tax default (DocumentForm.tsx).
export const DEFAULT_TAX_RATES: { name: string; rate: number; isDefault: boolean }[] = [
  { name: "Standard Rate", rate: 5, isDefault: true },
  { name: "Zero Rate", rate: 0, isDefault: false },
];

export const DEFAULT_PAYMENT_TERMS: { name: string; isDefault: boolean }[] = [
  { name: "Due end of next month", isDefault: false },
  { name: "Due end of the month", isDefault: false },
  { name: "Due on Receipt", isDefault: true },
  { name: "Net 15", isDefault: false },
  { name: "Net 30", isDefault: false },
  { name: "Net 45", isDefault: false },
  { name: "Net 60", isDefault: false },
];

// Invoices ship three due-date reminders; Bills ship just one ("Default"), matching the
// reference product.
export const DEFAULT_REMINDERS: { docType: string; name: string; triggerBasis: string }[] = [
  { docType: "invoices", name: "Payment Expected", triggerBasis: "expected_payment_date" },
  { docType: "invoices", name: "Reminder - 1", triggerBasis: "due_date" },
  { docType: "invoices", name: "Reminder - 2", triggerBasis: "due_date" },
  { docType: "invoices", name: "Reminder - 3", triggerBasis: "due_date" },
  { docType: "bills", name: "Payment Expected", triggerBasis: "expected_payment_date" },
  { docType: "bills", name: "Default", triggerBasis: "due_date" },
];

// Types here are the detailed Account Type values (see ACCOUNT_TYPE_OPTIONS in entities.ts),
// not the old 5 coarse buckets.
export const DEFAULT_ACCOUNTS: { code: string; name: string; type: string }[] = [
  { code: "1000", name: "Cash", type: "cash" },
  { code: "1010", name: "Accounts Receivable", type: "accounts_receivable" },
  { code: "1020", name: "Inventory Asset", type: "stock" },
  { code: "2000", name: "Accounts Payable", type: "accounts_payable" },
  { code: "2010", name: "VAT Payable", type: "other_current_liability" },
  { code: "3000", name: "Owner's Equity", type: "equity" },
  { code: "3010", name: "Retained Earnings", type: "equity" },
  { code: "4000", name: "Sales Income", type: "income" },
  { code: "4010", name: "Other Income", type: "other_income" },
  { code: "5000", name: "Cost of Goods Sold", type: "cost_of_goods_sold" },
  { code: "5010", name: "Rent Expense", type: "expense" },
  { code: "5020", name: "Salaries Expense", type: "expense" },
  { code: "5030", name: "Office Supplies", type: "expense" },
  { code: "5040", name: "Utilities Expense", type: "expense" },
  { code: "5050", name: "General Expense", type: "expense" },
  { code: "5060", name: "Bank Charges", type: "expense" },
  // Where an auto-generated payment journal (src/lib/auto-journal.ts) parks the part of a
  // received payment that isn't allocated to any invoice yet (an advance/excess amount).
  { code: "2020", name: "Unearned Revenue", type: "other_current_liability" },
  // The plug account the Opening Balances settings page (src/lib/auto-journal.ts's
  // syncOpeningBalanceJournal) posts to so the consolidated opening-balance entry always
  // balances without the user hand-computing the difference — matches the 2026-09-11
  // migration's backfill of the same account onto every pre-existing organization.
  { code: "2030", name: "Opening Balance Adjustments", type: "other_current_liability" },
  // Where Revenue Recognition (src/lib/auto-journal.ts's syncRevenueRecognitionSchedule /
  // processDueRevenueRecognition) parks the not-yet-earned portion of a straight-line invoice
  // line until each period's own service date arrives — a distinct liability from "Unearned
  // Revenue" above (that one is about unallocated payments, this one is about unearned,
  // already-invoiced income), matches the 2026-09-14 migration's backfill of the same account
  // onto every pre-existing organization.
  { code: "2040", name: "Deferred Revenue", type: "other_current_liability" },
];

/**
 * Creates a new organization, links it to userId via a membership, and seeds it with the
 * same starter data every organization in this app is expected to have. Must run inside an
 * already-open transaction on `client` — the caller owns BEGIN/COMMIT/ROLLBACK so this can
 * be composed with whatever else that transaction needs (e.g. signup also creates the user
 * row first).
 */
export async function provisionOrganization(
  client: PoolClient,
  {
    userId,
    organizationName,
    role,
    locationCountry,
  }: {
    userId: string;
    organizationName: string;
    role: "owner" | "admin" | "staff";
    // Optional so signup (which doesn't ask yet) still gets the DB's own default — only the
    // "+ New Organization" flow (src/app/api/organizations/route.ts) passes this explicitly,
    // collected via its onboarding-style "Organization Location" step.
    locationCountry?: string;
  }
): Promise<string> {
  let slug = slugify(organizationName) || "organization";
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const candidate = attempt === 0 ? slug : `${slug}-${attempt}`;
    const clash = await client.query(`SELECT id FROM organizations WHERE slug = $1`, [candidate]);
    if (clash.rowCount === 0) {
      slug = candidate;
      break;
    }
    attempt += 1;
  }

  const orgResult = await client.query(
    `INSERT INTO organizations (name, slug, location_country) VALUES ($1, $2, COALESCE($3, 'United Arab Emirates')) RETURNING id`,
    [organizationName, slug, locationCountry || null]
  );
  const orgId = orgResult.rows[0].id as string;

  await client.query(`INSERT INTO memberships (user_id, organization_id, role) VALUES ($1, $2, $3)`, [
    userId,
    orgId,
    role,
  ]);

  for (const acc of DEFAULT_ACCOUNTS) {
    await client.query(`INSERT INTO accounts (organization_id, code, name, type) VALUES ($1, $2, $3, $4)`, [
      orgId,
      acc.code,
      acc.name,
      acc.type,
    ]);
  }

  // Every bank/cash account needs a real GL account behind it for auto-generated payment
  // journals to debit — see gl_account_id on bank_accounts (migrations/1758600000000_auto_journals.js).
  const bankGlAccount = await client.query(
    `INSERT INTO accounts (organization_id, code, name, type) VALUES ($1, '1001', 'Petty Cash', 'cash') RETURNING id`,
    [orgId]
  );
  await client.query(
    `INSERT INTO bank_accounts (organization_id, account_type, account_name, currency, is_primary, gl_account_id)
     VALUES ($1, 'bank', 'Petty Cash', 'AED', true, $2)`,
    [orgId, bankGlAccount.rows[0].id]
  );

  for (const role_ of DEFAULT_ROLES) {
    await client.query(`INSERT INTO roles (organization_id, name, description) VALUES ($1, $2, $3)`, [
      orgId,
      role_.name,
      role_.description,
    ]);
  }

  await client.query(
    `INSERT INTO currencies (organization_id, code, name, symbol) VALUES ($1, 'AED', 'UAE Dirham', 'AED')`,
    [orgId]
  );
  for (const cur of DEFAULT_CURRENCIES) {
    await client.query(`INSERT INTO currencies (organization_id, code, name, symbol) VALUES ($1, $2, $3, $4)`, [
      orgId,
      cur.code,
      cur.name,
      cur.symbol,
    ]);
  }

  for (const rate of DEFAULT_TAX_RATES) {
    await client.query(
      `INSERT INTO tax_rates (organization_id, name, rate, is_default) VALUES ($1, $2, $3, $4)`,
      [orgId, rate.name, rate.rate, rate.isDefault]
    );
  }

  for (const term of DEFAULT_PAYMENT_TERMS) {
    await client.query(
      `INSERT INTO payment_terms (organization_id, name, is_default, is_active) VALUES ($1, $2, $3, true)`,
      [orgId, term.name, term.isDefault]
    );
  }

  for (const reminder of DEFAULT_REMINDERS) {
    await client.query(
      `INSERT INTO reminder_rules (organization_id, doc_type, name, trigger_basis, offset_days, direction, is_active)
       VALUES ($1, $2, $3, $4, 0, 'after', false)`,
      [orgId, reminder.docType, reminder.name, reminder.triggerBasis]
    );
  }

  return orgId;
}
