import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireActiveContext } from "@/lib/session";
import { requireModuleAccess } from "@/lib/module-access";
import { query, queryOne } from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/format";
import { defaultFiscalYearRange } from "@/lib/report-dates";
import { processDueJournalReversals } from "@/lib/journal-reversals";
import ReportDateRangeBar from "@/components/reports/ReportDateRangeBar";

interface Row {
  id: string;
  name: string;
  type: string;
  opening_debit: string;
  opening_credit: string;
  period_debit: string;
  period_credit: string;
}

// Same normal-balance-side grouping as Trial Balance/Balance Sheet/Profit and Loss.
const DEBIT_NORMAL_TYPES = [
  "other_asset", "other_current_asset", "cash", "bank", "fixed_asset", "accounts_receivable",
  "stock", "payment_clearing_account", "intangible_asset", "non_current_asset",
  "deferred_tax_asset", "capital_work_in_progress", "intangible_assets_under_development",
  "expense", "cost_of_goods_sold", "other_expense",
];

// One row per account: its net balance immediately before the period started ("Opening
// Balance"), the period's own Debit/Credit activity, and the resulting balance at the end of
// the period ("Closing Balance"). This app has no formal period-close, so "opening" for every
// account (income/expense included) is simply its cumulative net position the instant before
// `from` — the same "no closing entry" approach Balance Sheet's own Current Earnings line
// already relies on. This is the summarized General Ledger (one line per account); a Detailed
// General Ledger listing every individual journal line was out of scope for this pass.
export default async function GeneralLedgerPage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string };
}) {
  const ctx = await requireActiveContext();
  await requireModuleAccess(ctx, "reports", "view");
  await processDueJournalReversals(ctx.orgId);
  const org = await queryOne<{ fiscal_year_start: string | null }>(
    `SELECT fiscal_year_start FROM organizations WHERE id = $1`,
    [ctx.orgId]
  );
  const defaults = defaultFiscalYearRange(org?.fiscal_year_start);
  const from = searchParams.from || defaults.from;
  const to = searchParams.to || defaults.to;

  const rows = await query<Row>(
    `SELECT a.id, a.name, a.type,
            COALESCE(SUM(jl.debit) FILTER (WHERE mj.journal_date < $2), 0) AS opening_debit,
            COALESCE(SUM(jl.credit) FILTER (WHERE mj.journal_date < $2), 0) AS opening_credit,
            COALESCE(SUM(jl.debit) FILTER (WHERE mj.journal_date BETWEEN $2 AND $3), 0) AS period_debit,
            COALESCE(SUM(jl.credit) FILTER (WHERE mj.journal_date BETWEEN $2 AND $3), 0) AS period_credit
     FROM accounts a
     JOIN journal_lines jl ON jl.account_id = a.id
     JOIN manual_journals mj ON mj.id = jl.journal_id AND mj.status = 'published' AND mj.journal_date <= $3
     WHERE a.organization_id = $1
     GROUP BY a.id, a.name, a.type
     ORDER BY a.name`,
    [ctx.orgId, from, to]
  );

  const active = rows
    .map((r) => {
      const debitNormal = DEBIT_NORMAL_TYPES.includes(r.type);
      const openingNet = Number(r.opening_debit) - Number(r.opening_credit);
      const periodDebit = Number(r.period_debit);
      const periodCredit = Number(r.period_credit);
      const opening = debitNormal ? openingNet : -openingNet;
      const closing = opening + (debitNormal ? periodDebit - periodCredit : periodCredit - periodDebit);
      return { id: r.id, name: r.name, opening, periodDebit, periodCredit, closing };
    })
    .filter((r) => Math.abs(r.opening) > 0.005 || r.periodDebit !== 0 || r.periodCredit !== 0)
    .sort((a, b) => a.name.localeCompare(b.name));

  const totalOpening = active.reduce((sum, r) => sum + r.opening, 0);
  const totalDebit = active.reduce((sum, r) => sum + r.periodDebit, 0);
  const totalCredit = active.reduce((sum, r) => sum + r.periodCredit, 0);
  const totalClosing = active.reduce((sum, r) => sum + r.closing, 0);

  return (
    <div>
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <Link href="/reports" className="mb-1 flex items-center gap-1 text-xs text-gray-400 hover:text-brand-600">
          <ChevronLeft size={12} /> All Reports
        </Link>
        <h1 className="text-lg font-semibold text-ink-800">General Ledger</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          {formatDate(from)} to {formatDate(to)}
        </p>
      </div>

      <ReportDateRangeBar from={from} to={to} />

      <div className="p-6">
        <div className="card overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="whitespace-nowrap px-5 py-2.5">Account Name</th>
                <th className="whitespace-nowrap px-5 py-2.5 text-right">Opening Balance</th>
                <th className="whitespace-nowrap px-5 py-2.5 text-right">Debit</th>
                <th className="whitespace-nowrap px-5 py-2.5 text-right">Credit</th>
                <th className="whitespace-nowrap px-5 py-2.5 text-right">Closing Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {active.length === 0 ? (
                <tr>
                  <td className="px-5 py-10 text-center text-gray-400" colSpan={5}>
                    No account activity in this period.
                  </td>
                </tr>
              ) : (
                active.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap px-5 py-2.5 text-ink-700">
                      <Link href={`/chart-of-accounts/${r.id}`} className="hover:underline">
                        {r.name}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-right text-ink-800">
                      {formatCurrency(r.opening)}
                    </td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-right text-ink-800">
                      {formatCurrency(r.periodDebit)}
                    </td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-right text-ink-800">
                      {formatCurrency(r.periodCredit)}
                    </td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-right font-medium text-ink-800">
                      {formatCurrency(r.closing)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {active.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold text-ink-800">
                  <td className="px-5 py-2.5">Total</td>
                  <td className="px-5 py-2.5 text-right">{formatCurrency(totalOpening)}</td>
                  <td className="px-5 py-2.5 text-right">{formatCurrency(totalDebit)}</td>
                  <td className="px-5 py-2.5 text-right">{formatCurrency(totalCredit)}</td>
                  <td className="px-5 py-2.5 text-right">{formatCurrency(totalClosing)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <p className="mt-3 text-xs text-gray-400">
          Opening Balance is each account&apos;s cumulative net position immediately before {formatDate(from)}.
          Closing Balance = Opening Balance + this period&apos;s Debit − Credit activity (or Credit − Debit for
          liability/equity/income accounts). This is a per-account summary — for every individual journal line,
          open a document&apos;s own Journal panel.
        </p>
      </div>
    </div>
  );
}
