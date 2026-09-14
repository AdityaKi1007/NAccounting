import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireActiveContext } from "@/lib/session";
import { requireModuleAccess } from "@/lib/module-access";
import { query, queryOne } from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/format";
import { defaultFiscalYearRange } from "@/lib/report-dates";
import { processDueJournalReversals } from "@/lib/journal-reversals";
import { processDueRevenueRecognition } from "@/lib/auto-journal";
import { loadProjectUnitOptions, normalizeFilterId } from "@/lib/report-filters";
import ReportDateRangeBar from "@/components/reports/ReportDateRangeBar";

interface AccountLine {
  id: string;
  name: string;
  type: string;
  debit: string;
  credit: string;
}

const INCOME_TYPES = ["income", "other_income"];
const COGS_TYPES = ["cost_of_goods_sold"];
const EXPENSE_TYPES = ["expense", "other_expense"];

// Journals aren't themselves tagged with a Project/Unit — attribution is traced back to the
// document that generated the journal (invoice/bill/payment received/payment made) via
// manual_journals' link-back columns. Since a journal is internally balanced and every line of
// one journal shares the same source document, filtering by this traced project/unit drops or
// keeps a whole journal at a time. Journals with no traceable source (credit/debit notes,
// expenses, vendor credits, refunds, opening balances) are excluded when a filter is active.
async function loadLines(
  orgId: string,
  from: string,
  to: string,
  types: string[],
  projectId: string | null,
  unitId: string | null
): Promise<AccountLine[]> {
  return query<AccountLine>(
    `SELECT a.id, a.name, a.type, COALESCE(SUM(jl.debit), 0) AS debit, COALESCE(SUM(jl.credit), 0) AS credit
     FROM journal_lines jl
     JOIN manual_journals mj ON mj.id = jl.journal_id
     JOIN accounts a ON a.id = jl.account_id
     LEFT JOIN invoices src_inv ON src_inv.id = mj.invoice_id
     LEFT JOIN bills src_bill ON src_bill.id = mj.bill_id
     LEFT JOIN payments_received src_pr ON src_pr.id = mj.payment_id
     LEFT JOIN payments_made src_pm ON src_pm.id = mj.payment_made_id
     WHERE mj.organization_id = $1 AND a.organization_id = $1 AND mj.status = 'published' AND mj.journal_date BETWEEN $2 AND $3 AND a.type = ANY($4::text[])
       AND ($5::uuid IS NULL OR COALESCE(src_inv.project_id, src_bill.project_id, src_pr.project_id, src_pm.project_id) = $5::uuid)
       AND ($6::uuid IS NULL OR COALESCE(src_inv.unit_id, src_bill.unit_id, src_pr.unit_id, src_pm.unit_id) = $6::uuid)
     GROUP BY a.id, a.name, a.type
     HAVING COALESCE(SUM(jl.debit), 0) != COALESCE(SUM(jl.credit), 0)
     ORDER BY a.name`,
    [orgId, from, to, types, projectId, unitId]
  );
}

function creditNormalTotal(lines: AccountLine[]) {
  return lines.reduce((sum, l) => sum + (Number(l.credit) - Number(l.debit)), 0);
}
function debitNormalTotal(lines: AccountLine[]) {
  return lines.reduce((sum, l) => sum + (Number(l.debit) - Number(l.credit)), 0);
}

export default async function ProfitAndLossPage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string; projectId?: string; unitId?: string };
}) {
  const ctx = await requireActiveContext();
  await requireModuleAccess(ctx, "reports", "view");
  await processDueJournalReversals(ctx.orgId);
  await processDueRevenueRecognition(ctx.orgId);
  const org = await queryOne<{ fiscal_year_start: string | null }>(
    `SELECT fiscal_year_start FROM organizations WHERE id = $1`,
    [ctx.orgId]
  );
  const defaults = defaultFiscalYearRange(org?.fiscal_year_start);
  const from = searchParams.from || defaults.from;
  const to = searchParams.to || defaults.to;
  const projectId = normalizeFilterId(searchParams.projectId);
  const unitId = normalizeFilterId(searchParams.unitId);
  const { projects, units } = await loadProjectUnitOptions(ctx.orgId);
  const filtered = Boolean(projectId || unitId);

  const [income, cogs, expenses] = await Promise.all([
    loadLines(ctx.orgId, from, to, INCOME_TYPES, projectId, unitId),
    loadLines(ctx.orgId, from, to, COGS_TYPES, projectId, unitId),
    loadLines(ctx.orgId, from, to, EXPENSE_TYPES, projectId, unitId),
  ]);

  const totalIncome = creditNormalTotal(income);
  const totalCogs = debitNormalTotal(cogs);
  const grossProfit = totalIncome - totalCogs;
  const totalExpenses = debitNormalTotal(expenses);
  const netProfit = grossProfit - totalExpenses;

  return (
    <div>
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
        <div>
          <Link href="/reports" className="mb-1 flex items-center gap-1 text-xs text-gray-400 hover:text-brand-600">
            <ChevronLeft size={12} /> All Reports
          </Link>
          <h1 className="text-lg font-semibold text-ink-800">Profit and Loss</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {formatDate(from)} to {formatDate(to)}
          </p>
        </div>
      </div>

      <ReportDateRangeBar from={from} to={to} projectId={projectId} unitId={unitId} projects={projects} units={units} />

      <div className="p-6">
        <div className="card overflow-hidden">
          <table className="w-full text-left text-sm">
            <tbody className="divide-y divide-gray-100">
              <tr className="bg-gray-50">
                <td className="px-5 py-2 font-semibold text-ink-800" colSpan={2}>
                  Income
                </td>
              </tr>
              {income.length === 0 ? (
                <tr>
                  <td className="px-5 py-3 pl-9 text-gray-400" colSpan={2}>
                    No income posted in this period.
                  </td>
                </tr>
              ) : (
                income.map((l) => (
                  <tr key={l.id}>
                    <td className="px-5 py-2 pl-9 text-ink-700">{l.name}</td>
                    <td className="px-5 py-2 text-right text-ink-800">
                      {formatCurrency(Number(l.credit) - Number(l.debit))}
                    </td>
                  </tr>
                ))
              )}
              <tr className="border-t border-gray-200 font-semibold text-ink-800">
                <td className="px-5 py-2">Total Income</td>
                <td className="px-5 py-2 text-right">{formatCurrency(totalIncome)}</td>
              </tr>

              <tr className="bg-gray-50">
                <td className="px-5 py-2 font-semibold text-ink-800" colSpan={2}>
                  Cost of Goods Sold
                </td>
              </tr>
              {cogs.length === 0 ? (
                <tr>
                  <td className="px-5 py-3 pl-9 text-gray-400" colSpan={2}>
                    No cost of goods sold posted in this period.
                  </td>
                </tr>
              ) : (
                cogs.map((l) => (
                  <tr key={l.id}>
                    <td className="px-5 py-2 pl-9 text-ink-700">{l.name}</td>
                    <td className="px-5 py-2 text-right text-ink-800">
                      {formatCurrency(Number(l.debit) - Number(l.credit))}
                    </td>
                  </tr>
                ))
              )}
              <tr className="border-t border-gray-200 font-semibold text-ink-800">
                <td className="px-5 py-2">Total Cost of Goods Sold</td>
                <td className="px-5 py-2 text-right">{formatCurrency(totalCogs)}</td>
              </tr>

              <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold text-ink-800">
                <td className="px-5 py-2.5">Gross Profit</td>
                <td className="px-5 py-2.5 text-right">{formatCurrency(grossProfit)}</td>
              </tr>

              <tr className="bg-gray-50">
                <td className="px-5 py-2 font-semibold text-ink-800" colSpan={2}>
                  Operating Expenses
                </td>
              </tr>
              {expenses.length === 0 ? (
                <tr>
                  <td className="px-5 py-3 pl-9 text-gray-400" colSpan={2}>
                    No operating expenses posted in this period.
                  </td>
                </tr>
              ) : (
                expenses.map((l) => (
                  <tr key={l.id}>
                    <td className="px-5 py-2 pl-9 text-ink-700">{l.name}</td>
                    <td className="px-5 py-2 text-right text-ink-800">
                      {formatCurrency(Number(l.debit) - Number(l.credit))}
                    </td>
                  </tr>
                ))
              )}
              <tr className="border-t border-gray-200 font-semibold text-ink-800">
                <td className="px-5 py-2">Total Operating Expenses</td>
                <td className="px-5 py-2 text-right">{formatCurrency(totalExpenses)}</td>
              </tr>

              <tr className="border-t-2 border-gray-300 bg-gray-50 text-base font-bold text-ink-800">
                <td className="px-5 py-3">Net Profit</td>
                <td className="px-5 py-3 text-right">{formatCurrency(netProfit)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        {filtered && (
          <p className="mt-3 text-xs text-gray-400">
            Filtered by Project/Unit: only journal entries traceable to a Project/Unit-tagged Invoice, Bill,
            Payment Received, or Payment Made are included. Entries with no traceable source — Credit/Debit
            Notes, Expenses, Vendor Credits, Refunds, and Opening Balance entries — are excluded while this
            filter is active (switch back to All Projects/All Units to include them).
          </p>
        )}
      </div>
    </div>
  );
}
