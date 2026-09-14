import { query, queryOne } from "@/lib/db";
import { accountCategory } from "@/lib/accounts";

// Query layer for the CFO Dashboard (/dashboard). Every figure here re-derives from the same
// underlying tables the real Reports section already uses (invoices, payments_received,
// payments_made, journal_lines, other_charges) rather than a cached/precomputed snapshot, so
// the dashboard can never drift out of sync with the real reports. Where a report already
// exists (AR Aging Summary, Receivable Summary, Customer Balance Summary, Sales by Customer,
// Profit and Loss, Cash Flow Statement, General Ledger), this file mirrors that report's own
// formula — condensed for a dashboard card (grand totals, top-N + a link to the full report)
// rather than duplicating its full per-row detail.

const CASH_TYPES = ["cash", "bank"];

export interface AgingBucket {
  current: number;
  d1to30: number;
  d31to60: number;
  d61to90: number;
  over90: number;
  total: number;
}

function emptyBucket(): AgingBucket {
  return { current: 0, d1to30: 0, d31to60: 0, d61to90: 0, over90: 0, total: 0 };
}

function addToBucket(bucket: AgingBucket, balance: number, dueDate: string | null, asOfDate: Date) {
  let daysPastDue = -1;
  if (dueDate) {
    const due = new Date(dueDate);
    daysPastDue = Math.floor((asOfDate.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
  }
  if (daysPastDue <= 0) bucket.current += balance;
  else if (daysPastDue <= 30) bucket.d1to30 += balance;
  else if (daysPastDue <= 60) bucket.d31to60 += balance;
  else if (daysPastDue <= 90) bucket.d61to90 += balance;
  else bucket.over90 += balance;
  bucket.total += balance;
}

export interface ProjectAgingRow {
  projectId: string | null;
  projectName: string;
  bucket: AgingBucket;
}

/** Same aging-bucket logic as /reports/ar-aging-summary (unpaid/partial invoices as of a date,
 * bucketed by days past due date), grouped by Project instead of by Customer — the existing
 * report has no project-grouped view, only a project *filter*. */
export async function arAgingByProject(
  orgId: string,
  asOf: string,
  projectId: string | null
): Promise<{ rows: ProjectAgingRow[]; grand: AgingBucket }> {
  const invoices = await query<{ project_id: string | null; project_name: string | null; due_date: string | null; balance_due: string }>(
    `SELECT i.project_id, p.name AS project_name, i.due_date, i.balance_due
     FROM invoices i
     LEFT JOIN projects p ON p.id = i.project_id
     WHERE i.organization_id = $1 AND i.status NOT IN ('draft', 'void') AND i.balance_due > 0.005
       AND i.invoice_date <= $2
       AND ($3::uuid IS NULL OR i.project_id = $3::uuid)
     ORDER BY p.name NULLS LAST`,
    [orgId, asOf, projectId]
  );

  const asOfDate = new Date(asOf + "T00:00:00Z");
  const byProject = new Map<string, ProjectAgingRow>();
  const grand = emptyBucket();

  for (const inv of invoices) {
    const key = inv.project_id ?? "none";
    if (!byProject.has(key)) {
      byProject.set(key, {
        projectId: inv.project_id,
        projectName: inv.project_name ?? "(No Project)",
        bucket: emptyBucket(),
      });
    }
    const row = byProject.get(key)!;
    const balance = Number(inv.balance_due);
    addToBucket(row.bucket, balance, inv.due_date, asOfDate);
    addToBucket(grand, balance, inv.due_date, asOfDate);
  }

  const rows = Array.from(byProject.values()).sort((a, b) => b.bucket.total - a.bucket.total);
  return { rows, grand };
}

export interface ReceivableSummaryTotals {
  invoiced: number;
  received: number;
  balance: number;
}

/** Grand-total version of /reports/receivable-summary's own per-customer formula: Invoiced
 * Amount and Amount Received are period figures; Balance is the org's current outstanding
 * balance as of `to` (opening balances + every non-draft/void invoice's balance_due through
 * that date, same "running total, not period delta" semantics as the real report). */
export async function receivableSummaryTotals(
  orgId: string,
  from: string,
  to: string,
  projectId: string | null
): Promise<ReceivableSummaryTotals> {
  const row = await queryOne<{ invoiced: string | null; received: string | null; balance: string | null; opening: string | null }>(
    `SELECT
       (SELECT COALESCE(SUM(i.total), 0) FROM invoices i
        WHERE i.organization_id = $1 AND i.status NOT IN ('draft', 'void') AND i.invoice_date BETWEEN $2 AND $3
          AND ($4::uuid IS NULL OR i.project_id = $4::uuid)) AS invoiced,
       (SELECT COALESCE(SUM(p.amount), 0) FROM payments_received p
        WHERE p.organization_id = $1 AND p.status != 'draft' AND p.payment_date BETWEEN $2 AND $3
          AND ($4::uuid IS NULL OR p.project_id = $4::uuid)) AS received,
       (SELECT COALESCE(SUM(i.balance_due), 0) FROM invoices i
        WHERE i.organization_id = $1 AND i.status NOT IN ('draft', 'void') AND i.invoice_date <= $3
          AND ($4::uuid IS NULL OR i.project_id = $4::uuid)) AS balance,
       (SELECT COALESCE(SUM(c.opening_balance), 0) FROM customers c WHERE c.organization_id = $1) AS opening`,
    [orgId, from, to, projectId]
  );
  // Opening Balance is a customer-level lump sum, not tied to any Project — excluded whenever a
  // Project filter is active, same rule the real Receivable Summary report applies per customer.
  const openingTotal = projectId ? 0 : Number(row?.opening ?? 0);
  return {
    invoiced: Number(row?.invoiced ?? 0),
    received: Number(row?.received ?? 0),
    balance: openingTotal + Number(row?.balance ?? 0),
  };
}

export interface CustomerBalanceRow {
  id: string;
  name: string;
  balance: number;
}

/** Top-N customers by current outstanding balance, same formula as
 * /reports/customer-balance-summary (opening_balance + invoices' balance_due as of `asOf`),
 * plus the true grand total across every customer (not just the shown top N). */
export async function topCustomerBalances(
  orgId: string,
  asOf: string,
  projectId: string | null,
  limit: number
): Promise<{ rows: CustomerBalanceRow[]; total: number; totalCount: number }> {
  const rows = await query<{ id: string; display_name: string; opening_balance: string; invoices_balance: string }>(
    `SELECT c.id, c.display_name, c.opening_balance,
            COALESCE((
              SELECT SUM(i.balance_due) FROM invoices i
              WHERE i.customer_id = c.id AND i.status NOT IN ('draft', 'void') AND i.invoice_date <= $2
                AND ($3::uuid IS NULL OR i.project_id = $3::uuid)
            ), 0) AS invoices_balance
     FROM customers c
     WHERE c.organization_id = $1
     ORDER BY c.display_name`,
    [orgId, asOf, projectId]
  );
  const filtered = Boolean(projectId);
  const withBalance = rows
    .map((r) => ({
      id: r.id,
      name: r.display_name,
      balance: (filtered ? 0 : Number(r.opening_balance)) + Number(r.invoices_balance),
    }))
    .filter((r) => Math.abs(r.balance) > 0.005)
    .sort((a, b) => b.balance - a.balance);

  const total = withBalance.reduce((sum, r) => sum + r.balance, 0);
  return { rows: withBalance.slice(0, limit), total, totalCount: withBalance.length };
}

export interface CustomerSalesRow {
  id: string | null;
  name: string;
  total: number;
}

/** Top-N customers by period sales, same formula as /reports/sales-by-customer, plus the true
 * grand total across every customer. */
export async function topCustomerSales(
  orgId: string,
  from: string,
  to: string,
  projectId: string | null,
  limit: number
): Promise<{ rows: CustomerSalesRow[]; total: number; totalCount: number }> {
  const rows = await query<{ customer_id: string | null; customer_name: string | null; total: string }>(
    `SELECT c.id AS customer_id, c.display_name AS customer_name, SUM(i.total) AS total
     FROM invoices i
     LEFT JOIN customers c ON c.id = i.customer_id
     WHERE i.organization_id = $1 AND i.status NOT IN ('draft', 'void') AND i.invoice_date BETWEEN $2 AND $3
       AND ($4::uuid IS NULL OR i.project_id = $4::uuid)
     GROUP BY c.id, c.display_name
     ORDER BY SUM(i.total) DESC`,
    [orgId, from, to, projectId]
  );
  const mapped = rows.map((r) => ({ id: r.customer_id, name: r.customer_name ?? "(No customer)", total: Number(r.total) }));
  const total = mapped.reduce((sum, r) => sum + r.total, 0);
  return { rows: mapped.slice(0, limit), total, totalCount: mapped.length };
}

export interface ProfitAndLoss {
  totalIncome: number;
  totalCogs: number;
  grossProfit: number;
  totalExpenses: number;
  netProfit: number;
}

async function categoryNetTotal(
  orgId: string,
  from: string,
  to: string,
  types: string[],
  projectId: string | null,
  normal: "debit" | "credit"
): Promise<number> {
  const row = await queryOne<{ debit: string | null; credit: string | null }>(
    `SELECT COALESCE(SUM(jl.debit), 0) AS debit, COALESCE(SUM(jl.credit), 0) AS credit
     FROM journal_lines jl
     JOIN manual_journals mj ON mj.id = jl.journal_id
     JOIN accounts a ON a.id = jl.account_id
     LEFT JOIN invoices src_inv ON src_inv.id = mj.invoice_id
     LEFT JOIN bills src_bill ON src_bill.id = mj.bill_id
     LEFT JOIN payments_received src_pr ON src_pr.id = mj.payment_id
     LEFT JOIN payments_made src_pm ON src_pm.id = mj.payment_made_id
     WHERE mj.organization_id = $1 AND a.organization_id = $1 AND mj.status = 'published' AND mj.journal_date BETWEEN $2 AND $3 AND a.type = ANY($4::text[])
       AND ($5::uuid IS NULL OR COALESCE(src_inv.project_id, src_bill.project_id, src_pr.project_id, src_pm.project_id) = $5::uuid)`,
    [orgId, from, to, types, projectId]
  );
  const debit = Number(row?.debit ?? 0);
  const credit = Number(row?.credit ?? 0);
  return normal === "credit" ? credit - debit : debit - credit;
}

const INCOME_TYPES = ["income", "other_income"];
const COGS_TYPES = ["cost_of_goods_sold"];
const EXPENSE_TYPES = ["expense", "other_expense"];

/** Summary-line version of /reports/profit-and-loss (same account-type groupings and formula),
 * without the per-account breakdown — a dashboard card shows only the subtotal lines. */
export async function profitAndLossSummary(orgId: string, from: string, to: string, projectId: string | null): Promise<ProfitAndLoss> {
  const [totalIncome, totalCogs, totalExpenses] = await Promise.all([
    categoryNetTotal(orgId, from, to, INCOME_TYPES, projectId, "credit"),
    categoryNetTotal(orgId, from, to, COGS_TYPES, projectId, "debit"),
    categoryNetTotal(orgId, from, to, EXPENSE_TYPES, projectId, "debit"),
  ]);
  const grossProfit = totalIncome - totalCogs;
  const netProfit = grossProfit - totalExpenses;
  return { totalIncome, totalCogs, grossProfit, totalExpenses, netProfit };
}

async function cashMovement(
  orgId: string,
  from: string,
  to: string,
  linkColumn: string,
  direction: "debit" | "credit",
  sourceTable: string | null,
  projectId: string | null
) {
  if (projectId && !sourceTable) return 0;
  const sourceJoin = sourceTable ? `JOIN ${sourceTable} src ON src.id = mj.${linkColumn}` : "";
  const result = await queryOne<{ total: string | null }>(
    `SELECT SUM(jl.${direction}) AS total
     FROM journal_lines jl
     JOIN manual_journals mj ON mj.id = jl.journal_id
     JOIN accounts a ON a.id = jl.account_id
     ${sourceJoin}
     WHERE mj.organization_id = $1 AND a.organization_id = $1 AND mj.status = 'published' AND mj.journal_date BETWEEN $2 AND $3
       AND a.type = ANY($4::text[]) AND mj.${linkColumn} IS NOT NULL
       AND ($5::uuid IS NULL OR ${sourceTable ? "src.project_id" : "NULL::uuid"} = $5::uuid)`,
    [orgId, from, to, CASH_TYPES, projectId]
  );
  return Number(result?.total ?? 0);
}

export interface OperatingCashFlow {
  receivedFromCustomers: number;
  paidToVendors: number;
  paidForExpenses: number;
  netOperating: number;
}

/** Same three-source formula as /reports/cash-flow's own Operating Activities section — this
 * dashboard card deliberately does not attempt a combined Beginning/Ending Cash Balance (that
 * figure is the org's actual whole bank balance and only makes sense unfiltered/undated the
 * way the real report computes it); see the page component for how Investing/Financing are
 * added on top without conflating a period figure with Other Charges' non-dated totals. */
export async function operatingCashFlow(orgId: string, from: string, to: string, projectId: string | null): Promise<OperatingCashFlow> {
  const [receivedFromCustomers, paidToVendors, paidForExpenses] = await Promise.all([
    cashMovement(orgId, from, to, "payment_id", "debit", "payments_received", projectId),
    cashMovement(orgId, from, to, "payment_made_id", "credit", "payments_made", projectId),
    cashMovement(orgId, from, to, "expense_id", "credit", null, projectId),
  ]);
  return {
    receivedFromCustomers,
    paidToVendors,
    paidForExpenses,
    netOperating: receivedFromCustomers - paidToVendors - paidForExpenses,
  };
}

export interface OtherChargesByCategory {
  category: string;
  aedMn: number;
}

/** Other Charges (Property Master → Other Charges) has no date field — it's a per-project cost
 * allocation, not a dated transaction — so this cannot be filtered by the dashboard's from/to
 * range the way the rest of Cash Flow is. Scoped only by the Project filter (or every project's
 * charges, when none is selected), and surfaced as its own clearly-labeled Investing Activities
 * section so it's never silently summed into a period-bound "Net Change in Cash" figure. */
export async function otherChargesForCashFlow(
  orgId: string,
  projectId: string | null
): Promise<{ rows: OtherChargesByCategory[]; total: number }> {
  const rows = await query<{ category: string; total: string }>(
    `SELECT category, COALESCE(SUM(aed_mn), 0) AS total
     FROM other_charges
     WHERE organization_id = $1 AND ($2::uuid IS NULL OR project_id = $2::uuid)
     GROUP BY category
     HAVING COALESCE(SUM(aed_mn), 0) != 0
     ORDER BY SUM(aed_mn) DESC`,
    [orgId, projectId]
  );
  const mapped = rows.map((r) => ({ category: r.category, aedMn: Number(r.total) }));
  const total = mapped.reduce((sum, r) => sum + r.aedMn, 0);
  return { rows: mapped, total };
}

export interface GlSummaryRow {
  label: string;
  debit: number;
  credit: number;
  balance: number;
  side: "debit" | "credit";
}

// Dashboard-only mid-level rollup, coarser than the real per-account General Ledger report but
// finer than accounts.ts's 5-way asset/liability/equity/income/expense split — chosen to match
// the handful of category lines a CFO dashboard actually needs at a glance. Every detailed
// account type maps to exactly one bucket below; anything not explicitly listed falls into
// "Other" so no account balance is ever silently dropped from the total.
const GL_BUCKETS: { label: string; types: string[] }[] = [
  { label: "Cash & Bank", types: ["cash", "bank"] },
  { label: "Accounts Receivable", types: ["accounts_receivable"] },
  { label: "Property / Inventory", types: ["stock"] },
  { label: "Accounts Payable", types: ["accounts_payable"] },
  { label: "Revenue", types: ["income", "other_income"] },
  { label: "Operating Expenses", types: ["expense", "cost_of_goods_sold", "other_expense"] },
];

/** Cumulative (all-time through `to`, not period-only) balance per GL bucket — matches the real
 * General Ledger report's own "Closing Balance" semantics, condensed from per-account to a
 * handful of category rows. */
export async function generalLedgerSummary(orgId: string, to: string, projectId: string | null): Promise<GlSummaryRow[]> {
  const rows = await query<{ type: string; debit: string; credit: string }>(
    `SELECT a.type, COALESCE(SUM(jl.debit), 0) AS debit, COALESCE(SUM(jl.credit), 0) AS credit
     FROM journal_lines jl
     JOIN manual_journals mj ON mj.id = jl.journal_id
     JOIN accounts a ON a.id = jl.account_id
     LEFT JOIN invoices src_inv ON src_inv.id = mj.invoice_id
     LEFT JOIN bills src_bill ON src_bill.id = mj.bill_id
     LEFT JOIN payments_received src_pr ON src_pr.id = mj.payment_id
     LEFT JOIN payments_made src_pm ON src_pm.id = mj.payment_made_id
     WHERE mj.organization_id = $1 AND a.organization_id = $1 AND mj.status = 'published' AND mj.journal_date <= $2
       AND ($3::uuid IS NULL OR COALESCE(src_inv.project_id, src_bill.project_id, src_pr.project_id, src_pm.project_id) = $3::uuid)
     GROUP BY a.type`,
    [orgId, to, projectId]
  );

  const bucketed = GL_BUCKETS.map((b) => {
    const matching = rows.filter((r) => b.types.includes(r.type));
    const debit = matching.reduce((sum, r) => sum + Number(r.debit), 0);
    const credit = matching.reduce((sum, r) => sum + Number(r.credit), 0);
    const net = debit - credit;
    const debitNormal = accountCategory(b.types[0]) === "asset" || accountCategory(b.types[0]) === "expense";
    return {
      label: b.label,
      debit,
      credit,
      balance: Math.abs(net),
      side: (debitNormal ? net >= 0 : net < 0) ? ("debit" as const) : ("credit" as const),
    };
  });

  const knownTypes = new Set(GL_BUCKETS.flatMap((b) => b.types));
  const other = rows.filter((r) => !knownTypes.has(r.type));
  if (other.length > 0) {
    const debit = other.reduce((sum, r) => sum + Number(r.debit), 0);
    const credit = other.reduce((sum, r) => sum + Number(r.credit), 0);
    if (debit !== 0 || credit !== 0) {
      const net = debit - credit;
      bucketed.push({
        label: "Other",
        debit,
        credit,
        balance: Math.abs(net),
        side: net >= 0 ? "debit" : "credit",
      });
    }
  }

  return bucketed.filter((b) => b.debit !== 0 || b.credit !== 0);
}

