// One-off maintenance script: adds the user-supplied standard real-estate Chart of Accounts
// (GL codes 1000-8400) to an organization, run by hand — NOT part of `npm run seed` (that only
// ever runs once, at initial org creation) and NOT a migration (this is org data, not schema).
//
// Request (2026-09-15): "add below chart of accounts with GL codes and replace if already same
// GL Code" — but NeoProp Technologies' real Chart of Accounts already has 25 accounts under
// codes 1000-5060 from earlier org setup, several with real posted journal_lines against them
// (1000 Cash, 1010 Accounts Receivable, 2000 Accounts Payable, 2010 VAT Payable, 3000 Owner's
// Equity, 4000 Property Sales Revenue — plus 5000 Cost of Units Sold, unused but present).
// Exactly 7 of the new list's codes collide with these: 1000, 1010, 2000, 2010, 3000, 4000,
// 5000. Blindly overwriting them as literally requested would have retroactively relabeled
// already-posted transactions (e.g. code 1010 "Accounts Receivable" -> "Petty Cash", changing
// type accounts_receivable -> cash) and, since 1010/2010 are currently this org's *only*
// accounts_receivable/VAT-Payable-matching accounts, have broken every future invoice/bill's
// automatic journal posting (auto-journal.ts's findAccountId resolves by `type`, sometimes
// `type` + a nameLike pattern like "vat" or "receivable" — see that file's own top comment).
// Asked the user; they chose the safe default: skip any code that already exists (leave that
// account's name/type/code completely untouched, whatever it currently is) and add only the
// codes that don't yet exist. That's what this script does — see `resolveOrCreate` below.
//
// Idempotent / safe to re-run: a second run finds every code from the first run already
// present and inserts nothing further (still 0 changes to any pre-existing account either way).
//
// Usage:  npm run seed:coa-gl-codes          (targets NeoProp Technologies by default)
//         npm run seed:coa-gl-codes -- some-other-org-slug

import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/neoaccountingz",
});

const ORG_SLUG = process.argv[2] || "neoprop-technologies";

interface AccountSpec {
  code: string;
  name: string;
  type: string;
  parentCode?: string;
}

// Types drawn from ACCOUNT_TYPE_OPTIONS (src/lib/entities.ts) — the exact set this app's
// Account Type dropdown offers. A few judgment calls where the user's list didn't specify a
// type and more than one reasonable mapping exists:
//   - 2110/2120 Output/Input VAT: kept as other_current_liability (same as their 2100 VAT
//     Payable parent) since the user placed both explicitly under the Liabilities section,
//     even though Input VAT is technically a recoverable/asset-like amount in strict
//     double-entry practice. Netting VAT payable/receivable through one control account is a
//     common simplified approach.
//   - 2500 Loans & Borrowings: non_current_liability (a generic "loan" is usually long-term;
//     the user's list had no separate current/non-current loan split).
//   - 8400 Gain/Loss on Asset Disposal: other_income (a single netting line can go either way
//     depending on sign; picked other_income as the default side).
const ACCOUNTS: AccountSpec[] = [
  // ---- Assets ----
  { code: "1000", name: "Cash & Cash Equivalents", type: "cash" },
  { code: "1010", name: "Petty Cash", type: "cash", parentCode: "1000" },
  { code: "1100", name: "Bank Accounts", type: "bank" },
  { code: "1110", name: "Bank – AED Account", type: "bank", parentCode: "1100" },
  { code: "1120", name: "Bank – USD Account", type: "bank", parentCode: "1100" },
  { code: "1200", name: "Accounts Receivable", type: "accounts_receivable" },
  { code: "1210", name: "Customer Receivables", type: "accounts_receivable", parentCode: "1200" },
  { code: "1220", name: "Retention Receivable", type: "accounts_receivable", parentCode: "1200" },
  { code: "1300", name: "Inventory", type: "stock" },
  { code: "1310", name: "Property Inventory", type: "stock", parentCode: "1300" },
  { code: "1320", name: "Materials Inventory", type: "stock", parentCode: "1300" },
  { code: "1400", name: "Prepaid Expenses", type: "other_current_asset" },
  { code: "1410", name: "Prepaid Insurance", type: "other_current_asset", parentCode: "1400" },
  { code: "1420", name: "Prepaid Rent", type: "other_current_asset", parentCode: "1400" },
  { code: "1500", name: "Fixed Assets", type: "fixed_asset" },
  { code: "1510", name: "Buildings", type: "fixed_asset", parentCode: "1500" },
  { code: "1520", name: "Furniture & Fixtures", type: "fixed_asset", parentCode: "1500" },
  { code: "1530", name: "Computer Equipment", type: "fixed_asset", parentCode: "1500" },
  { code: "1540", name: "Vehicles", type: "fixed_asset", parentCode: "1500" },
  { code: "1590", name: "Accumulated Depreciation", type: "fixed_asset", parentCode: "1500" },

  // ---- Liabilities ----
  { code: "2000", name: "Accounts Payable", type: "accounts_payable" },
  { code: "2010", name: "Vendor Payables", type: "accounts_payable", parentCode: "2000" },
  { code: "2100", name: "VAT Payable", type: "other_current_liability" },
  { code: "2110", name: "Output VAT", type: "other_current_liability", parentCode: "2100" },
  { code: "2120", name: "Input VAT", type: "other_current_liability", parentCode: "2100" },
  { code: "2200", name: "Accrued Expenses", type: "other_current_liability" },
  { code: "2210", name: "Accrued Salaries", type: "other_current_liability", parentCode: "2200" },
  { code: "2220", name: "Accrued Utilities", type: "other_current_liability", parentCode: "2200" },
  { code: "2300", name: "Customer Deposits", type: "other_current_liability" },
  { code: "2310", name: "Security Deposits", type: "other_current_liability", parentCode: "2300" },
  { code: "2400", name: "Deferred Revenue", type: "other_current_liability" },
  { code: "2410", name: "Deferred Rental Income", type: "other_current_liability", parentCode: "2400" },
  { code: "2420", name: "Deferred Sales Revenue", type: "other_current_liability", parentCode: "2400" },
  { code: "2500", name: "Loans & Borrowings", type: "non_current_liability" },
  { code: "2600", name: "Employee Payables", type: "other_current_liability" },
  { code: "2700", name: "Other Current Liabilities", type: "other_current_liability" },

  // ---- Equity ----
  { code: "3000", name: "Share Capital", type: "equity" },
  { code: "3100", name: "Additional Paid-in Capital", type: "equity" },
  { code: "3200", name: "Retained Earnings", type: "equity" },
  { code: "3300", name: "Current Year Earnings", type: "equity" },
  { code: "3400", name: "Owner's Drawings", type: "equity" },

  // ---- Revenue / Income ----
  { code: "4000", name: "Sales Revenue", type: "income" },
  { code: "4100", name: "Property Sales Revenue", type: "income", parentCode: "4000" },
  { code: "4110", name: "Residential Property Sales", type: "income", parentCode: "4100" },
  { code: "4120", name: "Commercial Property Sales", type: "income", parentCode: "4100" },
  { code: "4200", name: "Rental Income", type: "income" },
  { code: "4210", name: "Residential Rental Income", type: "income", parentCode: "4200" },
  { code: "4220", name: "Commercial Rental Income", type: "income", parentCode: "4200" },
  { code: "4300", name: "Service Revenue", type: "income" },
  { code: "4310", name: "Management Fees", type: "income", parentCode: "4300" },
  { code: "4320", name: "Maintenance Income", type: "income", parentCode: "4300" },
  { code: "4400", name: "Commission Income", type: "income" },
  { code: "4500", name: "Other Operating Income", type: "other_income" },
  { code: "4900", name: "Other Income", type: "other_income" },

  // ---- Cost of Sales ----
  { code: "5000", name: "Cost of Sales", type: "cost_of_goods_sold" },
  { code: "5100", name: "Property Acquisition Cost", type: "cost_of_goods_sold", parentCode: "5000" },
  { code: "5110", name: "Land Cost", type: "cost_of_goods_sold", parentCode: "5100" },
  { code: "5120", name: "Construction Cost", type: "cost_of_goods_sold", parentCode: "5100" },
  { code: "5130", name: "Development Cost", type: "cost_of_goods_sold", parentCode: "5100" },
  { code: "5200", name: "Direct Project Costs", type: "cost_of_goods_sold", parentCode: "5000" },
  { code: "5210", name: "Contractor Costs", type: "cost_of_goods_sold", parentCode: "5200" },
  { code: "5220", name: "Project Materials", type: "cost_of_goods_sold", parentCode: "5200" },
  { code: "5300", name: "Property Sales Commission", type: "cost_of_goods_sold", parentCode: "5000" },
  { code: "5400", name: "Inventory Cost", type: "cost_of_goods_sold", parentCode: "5000" },

  // ---- Operating Expenses ----
  { code: "6000", name: "Operating Expenses", type: "expense" },
  { code: "6100", name: "Salaries & Wages", type: "expense", parentCode: "6000" },
  { code: "6110", name: "Employee Benefits", type: "expense", parentCode: "6100" },
  { code: "6200", name: "Sales & Marketing", type: "expense", parentCode: "6000" },
  { code: "6210", name: "Advertising", type: "expense", parentCode: "6200" },
  { code: "6220", name: "Marketing", type: "expense", parentCode: "6200" },
  { code: "6230", name: "Sales Commission", type: "expense", parentCode: "6200" },
  { code: "6300", name: "Rent Expense", type: "expense", parentCode: "6000" },
  { code: "6310", name: "Office Rent", type: "expense", parentCode: "6300" },
  { code: "6400", name: "Utilities", type: "expense", parentCode: "6000" },
  { code: "6410", name: "Electricity", type: "expense", parentCode: "6400" },
  { code: "6420", name: "Telephone & Internet", type: "expense", parentCode: "6400" },
  { code: "6500", name: "Professional Fees", type: "expense", parentCode: "6000" },
  { code: "6510", name: "Legal Fees", type: "expense", parentCode: "6500" },
  { code: "6520", name: "Accounting Fees", type: "expense", parentCode: "6500" },
  { code: "6530", name: "Consultancy Fees", type: "expense", parentCode: "6500" },
  { code: "6600", name: "Bank Charges", type: "expense", parentCode: "6000" },
  { code: "6700", name: "Insurance Expense", type: "expense", parentCode: "6000" },
  { code: "6800", name: "Depreciation Expense", type: "expense", parentCode: "6000" },
  { code: "6900", name: "Travel & Entertainment", type: "expense", parentCode: "6000" },
  { code: "7000", name: "Office Expenses", type: "expense", parentCode: "6000" },
  { code: "7010", name: "Stationery", type: "expense", parentCode: "7000" },
  { code: "7020", name: "Printing", type: "expense", parentCode: "7000" },
  { code: "7030", name: "Software & Subscriptions", type: "expense", parentCode: "7000" },
  { code: "7100", name: "Repairs & Maintenance", type: "expense", parentCode: "6000" },
  { code: "7200", name: "Bad Debt Expense", type: "expense", parentCode: "6000" },
  { code: "7300", name: "Miscellaneous Expenses", type: "expense", parentCode: "6000" },

  // ---- Other Income / Expenses ----
  { code: "8000", name: "Interest Income", type: "other_income" },
  { code: "8100", name: "Interest Expense", type: "other_expense" },
  { code: "8200", name: "Foreign Exchange Gain", type: "other_income" },
  { code: "8300", name: "Foreign Exchange Loss", type: "other_expense" },
  { code: "8400", name: "Gain/Loss on Asset Disposal", type: "other_income" },
];

async function main() {
  const client = await pool.connect();
  try {
    const org = await client.query<{ id: string; name: string }>(
      `SELECT id, name FROM organizations WHERE slug = $1`,
      [ORG_SLUG]
    );
    if (org.rowCount === 0) {
      console.error(`No organization found with slug "${ORG_SLUG}". Aborting — nothing changed.`);
      process.exit(1);
    }
    const orgId = org.rows[0].id;
    console.log(`Target organization: ${org.rows[0].name} (${orgId})\n`);

    await client.query("BEGIN");

    // Pass 1: resolve or create every account by code, skipping any code that already exists
    // (leaving that pre-existing row's name/type/code completely untouched — see top comment).
    const idByCode: Record<string, string> = {};
    const createdCodes = new Set<string>();
    const skippedDetails: { code: string; wantedName: string; existingName: string }[] = [];

    for (const spec of ACCOUNTS) {
      const existing = await client.query<{ id: string; name: string }>(
        `SELECT id, name FROM accounts WHERE organization_id = $1 AND code = $2`,
        [orgId, spec.code]
      );
      if (existing.rowCount && existing.rowCount > 0) {
        idByCode[spec.code] = existing.rows[0].id;
        if (existing.rows[0].name !== spec.name) {
          skippedDetails.push({ code: spec.code, wantedName: spec.name, existingName: existing.rows[0].name });
        }
        continue;
      }
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO accounts (organization_id, code, name, type, is_active) VALUES ($1, $2, $3, $4, true) RETURNING id`,
        [orgId, spec.code, spec.name, spec.type]
      );
      idByCode[spec.code] = inserted.rows[0].id;
      createdCodes.add(spec.code);
    }

    // Pass 2: link parent_account_id, but only on rows THIS SCRIPT just created — never touches
    // parent_account_id on a pre-existing/skipped row. The parent itself may be pre-existing
    // (e.g. new code 4100's parent 4000 already existed pre-collision) — that's fine and
    // intended, idByCode covers both cases.
    let linked = 0;
    for (const spec of ACCOUNTS) {
      if (!spec.parentCode || !createdCodes.has(spec.code)) continue;
      const parentId = idByCode[spec.parentCode];
      if (!parentId) continue; // shouldn't happen — every parentCode above is itself in ACCOUNTS
      await client.query(`UPDATE accounts SET parent_account_id = $1 WHERE id = $2`, [parentId, idByCode[spec.code]]);
      linked++;
    }

    await client.query("COMMIT");

    console.log(`Created ${createdCodes.size} new accounts.`);
    console.log(`Skipped ${ACCOUNTS.length - createdCodes.size} accounts whose GL code already existed (left untouched).`);
    console.log(`Linked ${linked} newly-created accounts to a parent account.\n`);
    if (skippedDetails.length > 0) {
      console.log("Codes that already existed under a DIFFERENT name than this list wanted (left as-is):");
      for (const d of skippedDetails) {
        console.log(`  ${d.code}: kept existing "${d.existingName}" (list wanted "${d.wantedName}")`);
      }
    }
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
