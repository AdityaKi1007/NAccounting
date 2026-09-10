import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireActiveContext } from "@/lib/session";
import { query } from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/format";
import { defaultAsOfDate } from "@/lib/report-dates";
import { processDueJournalReversals } from "@/lib/journal-reversals";
import ReportAsOfBar from "@/components/reports/ReportAsOfBar";

interface AccountLine {
  id: string;
  name: string;
  type: string;
  debit: string;
  credit: string;
}

// Every account.type value that belongs to each Balance Sheet section — mirrors
// ACCOUNT_TYPE_OPTIONS's groups in entities.ts (kept as a literal list here rather than
// imported, since that constant also carries UI-only fields like labels this doesn't need).
const ASSET_TYPES = [
  "other_asset", "other_current_asset", "cash", "bank", "fixed_asset", "accounts_receivable",
  "stock", "payment_clearing_account", "intangible_asset", "non_current_asset",
  "deferred_tax_asset", "capital_work_in_progress", "intangible_assets_under_development",
];
const LIABILITY_TYPES = [
  "other_current_liability", "credit_card", "non_current_liability", "other_liability",
  "accounts_payable", "deferred_tax_liability",
];
const EQUITY_TYPES = ["equity"];
const INCOME_TYPES = ["income", "other_income"];
const EXPENSE_TYPES = ["expense", "cost_of_goods_sold", "other_expense"];

async function loadCumulative(orgId: string, asOf: string, types: string[]): Promise<AccountLine[]> {
  return query<AccountLine>(
    `SELECT a.id, a.name, a.type, COALESCE(SUM(jl.debit), 0) AS debit, COALESCE(SUM(jl.credit), 0) AS credit
     FROM journal_lines jl
     JOIN manual_journals mj ON mj.id = jl.journal_id
     JOIN accounts a ON a.id = jl.account_id
     WHERE mj.organization_id = $1 AND mj.status = 'published' AND mj.journal_date <= $2 AND a.type = ANY($3::text[])
     GROUP BY a.id, a.name, a.type
     HAVING COALESCE(SUM(jl.debit), 0) != COALESCE(SUM(jl.credit), 0)
     ORDER BY a.name`,
    [orgId, asOf, types]
  );
}

const debitBalance = (l: AccountLine) => Number(l.debit) - Number(l.credit);
const creditBalance = (l: AccountLine) => Number(l.credit) - Number(l.debit);

function Section({ title, lines, balanceFn }: { title: string; lines: AccountLine[]; balanceFn: (l: AccountLine) => number }) {
  const total = lines.reduce((sum, l) => sum + balanceFn(l), 0);
  return (
    <>
      <tr className="bg-gray-50">
        <td className="px-5 py-2 font-semibold text-ink-800" colSpan={2}>
          {title}
        </td>
      </tr>
      {lines.length === 0 ? (
        <tr>
          <td className="px-5 py-3 pl-9 text-gray-400" colSpan={2}>
            No balance.
          </td>
        </tr>
      ) : (
        lines.map((l) => (
          <tr key={l.id}>
            <td className="px-5 py-2 pl-9 text-ink-700">{l.name}</td>
            <td className="px-5 py-2 text-right text-ink-800">{formatCurrency(balanceFn(l))}</td>
          </tr>
        ))
      )}
      <tr className="border-t border-gray-200 font-semibold text-ink-800">
        <td className="px-5 py-2">Total {title}</td>
        <td className="px-5 py-2 text-right">{formatCurrency(total)}</td>
      </tr>
    </>
  );
}

export default async function BalanceSheetPage({ searchParams }: { searchParams: { asOf?: string } }) {
  const ctx = await requireActiveContext();
  await processDueJournalReversals(ctx.orgId);
  const asOf = searchParams.asOf || defaultAsOfDate();

  const [assets, liabilities, equity, income, expenses] = await Promise.all([
    loadCumulative(ctx.orgId, asOf, ASSET_TYPES),
    loadCumulative(ctx.orgId, asOf, LIABILITY_TYPES),
    loadCumulative(ctx.orgId, asOf, EQUITY_TYPES),
    loadCumulative(ctx.orgId, asOf, INCOME_TYPES),
    loadCumulative(ctx.orgId, asOf, EXPENSE_TYPES),
  ]);

  const totalAssets = assets.reduce((sum, l) => sum + debitBalance(l), 0);
  const totalLiabilities = liabilities.reduce((sum, l) => sum + creditBalance(l), 0);
  const totalEquityAccounts = equity.reduce((sum, l) => sum + creditBalance(l), 0);
  // Books here are never formally "closed" into equity at fiscal year-end, so cumulative net
  // income/expense through this date is shown as its own Equity line ("Current Earnings") —
  // the standard way to make a running Balance Sheet balance without a closing entry.
  const currentEarnings =
    income.reduce((sum, l) => sum + creditBalance(l), 0) - expenses.reduce((sum, l) => sum + debitBalance(l), 0);
  const totalEquity = totalEquityAccounts + currentEarnings;
  const totalLiabilitiesAndEquity = totalLiabilities + totalEquity;

  return (
    <div>
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <Link href="/reports" className="mb-1 flex items-center gap-1 text-xs text-gray-400 hover:text-brand-600">
          <ChevronLeft size={12} /> All Reports
        </Link>
        <h1 className="text-lg font-semibold text-ink-800">Balance Sheet</h1>
        <p className="mt-0.5 text-sm text-gray-500">As of {formatDate(asOf)}</p>
      </div>

      <ReportAsOfBar asOf={asOf} />

      <div className="p-6">
        <div className="card overflow-hidden">
          <table className="w-full text-left text-sm">
            <tbody className="divide-y divide-gray-100">
              <Section title="Assets" lines={assets} balanceFn={debitBalance} />
              <Section title="Liabilities" lines={liabilities} balanceFn={creditBalance} />

              <tr className="bg-gray-50">
                <td className="px-5 py-2 font-semibold text-ink-800" colSpan={2}>
                  Equity
                </td>
              </tr>
              {equity.length === 0 ? (
                <tr>
                  <td className="px-5 py-3 pl-9 text-gray-400" colSpan={2}>
                    No balance.
                  </td>
                </tr>
              ) : (
                equity.map((l) => (
                  <tr key={l.id}>
                    <td className="px-5 py-2 pl-9 text-ink-700">{l.name}</td>
                    <td className="px-5 py-2 text-right text-ink-800">{formatCurrency(creditBalance(l))}</td>
                  </tr>
                ))
              )}
              <tr>
                <td className="px-5 py-2 pl-9 text-ink-700">Current Earnings</td>
                <td className="px-5 py-2 text-right text-ink-800">{formatCurrency(currentEarnings)}</td>
              </tr>
              <tr className="border-t border-gray-200 font-semibold text-ink-800">
                <td className="px-5 py-2">Total Equity</td>
                <td className="px-5 py-2 text-right">{formatCurrency(totalEquity)}</td>
              </tr>

              <tr className="border-t-2 border-gray-300 bg-gray-50 text-base font-bold text-ink-800">
                <td className="px-5 py-3">Total Liabilities and Equity</td>
                <td className="px-5 py-3 text-right">{formatCurrency(totalLiabilitiesAndEquity)}</td>
              </tr>
              <tr className="text-base font-bold text-ink-800">
                <td className="px-5 py-3">Total Assets</td>
                <td className="px-5 py-3 text-right">{formatCurrency(totalAssets)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {Math.abs(totalAssets - totalLiabilitiesAndEquity) > 0.01 && (
          <p className="mt-3 text-xs text-amber-600">
            Note: Total Assets and Total Liabilities and Equity don&apos;t match by{" "}
            {formatCurrency(Math.abs(totalAssets - totalLiabilitiesAndEquity))} — this can happen if the Chart of
            Accounts is missing an account a transaction needed to post against (see each document&apos;s Journal
            panel).
          </p>
        )}
      </div>
    </div>
  );
}
