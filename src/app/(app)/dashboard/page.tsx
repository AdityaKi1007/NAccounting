import Link from "next/link";
import { TrendingUp } from "lucide-react";
import { requireActiveContext } from "@/lib/session";
import { requireModuleAccess } from "@/lib/module-access";
import { queryOne } from "@/lib/db";
import { formatCompactCurrency, formatDate } from "@/lib/format";
import { defaultFiscalYearRange } from "@/lib/report-dates";
import { processDueJournalReversals } from "@/lib/journal-reversals";
import { loadProjectUnitOptions, normalizeFilterId } from "@/lib/report-filters";
import ReportDateRangeBar from "@/components/reports/ReportDateRangeBar";
import {
  arAgingByProject,
  receivableSummaryTotals,
  topCustomerBalances,
  topCustomerSales,
  profitAndLossSummary,
  operatingCashFlow,
  otherChargesForCashFlow,
  generalLedgerSummary,
} from "@/lib/dashboard";

// Executive summary ("CFO Dashboard") composing 7 condensed views on top of the same tables
// the real Reports section already reports from — requested directly: "create tab Dashboard
// after Home with below details on it, project wise AR aging summary, receivable summary,
// customer balance summary, sale by customers, profit and loss, cash flow statement, general
// ledge summary and project other charges include these in cash flow."
//
// Scope notes (no clarifying answer was available, so these are the most defensible calls,
// stated here for anyone revisiting this page):
//  - No KPI trend arrows/percentages ("+8.4% vs last year" etc.) — inventing a comparison
//    figure without being asked exactly which prior period to compare against risked shipping
//    a misleading number; the 4 KPI tiles show only the real, currently-computed figure.
//  - No Export Report button — not in the literal request, and this page is already a large
//    surface; a real export can be a fast follow-up once the numbers themselves are confirmed.
//  - Project-wise AR Aging lists every project with an outstanding balance (no top-N + "Other
//    Projects" cutoff) — more honest than an arbitrary cutoff the request never asked for.
//  - Other Charges has no date column (it's a per-project cost allocation, not a dated
//    transaction) so it cannot be filtered by the date range below the way the rest of Cash
//    Flow is; it is scoped only by the Project filter and shown as its own Investing Activities
//    section rather than folded into "Net Change in Cash" (see the note under that card).
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string; projectId?: string };
}) {
  const ctx = await requireActiveContext();
  await requireModuleAccess(ctx, "dashboard", "view");
  await processDueJournalReversals(ctx.orgId);

  const org = await queryOne<{ fiscal_year_start: string | null }>(
    `SELECT fiscal_year_start FROM organizations WHERE id = $1`,
    [ctx.orgId]
  );
  const defaults = defaultFiscalYearRange(org?.fiscal_year_start);
  const from = searchParams.from || defaults.from;
  const to = searchParams.to || defaults.to;
  const projectId = normalizeFilterId(searchParams.projectId);
  const { projects } = await loadProjectUnitOptions(ctx.orgId);

  const [aging, receivable, customerBalances, customerSales, pnl, operatingCf, otherCharges, gl] = await Promise.all([
    arAgingByProject(ctx.orgId, to, projectId),
    receivableSummaryTotals(ctx.orgId, from, to, projectId),
    topCustomerBalances(ctx.orgId, to, projectId, 8),
    topCustomerSales(ctx.orgId, from, to, projectId, 8),
    profitAndLossSummary(ctx.orgId, from, to, projectId),
    operatingCashFlow(ctx.orgId, from, to, projectId),
    otherChargesForCashFlow(ctx.orgId, projectId),
    generalLedgerSummary(ctx.orgId, to, projectId),
  ]);

  const totalReceivables = aging.grand.total;
  const overdueReceivables = aging.grand.total - aging.grand.current;
  const reportQuery = `${projectId ? `projectId=${projectId}&` : ""}asOf=${to}`;

  return (
    <div>
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <h1 className="text-lg font-semibold text-ink-800">CFO Dashboard</h1>
        <p className="mt-0.5 text-sm text-gray-500">Executive financial overview across projects and entities</p>
      </div>

      <ReportDateRangeBar from={from} to={to} projectId={projectId} projects={projects} />

      <div className="space-y-6 p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiTile label="Total Receivables" value={totalReceivables} />
          <KpiTile label="Overdue Receivables" value={overdueReceivables} />
          <KpiTile label="Total Sales" value={pnl.totalIncome} />
          <KpiTile label="Net Profit" value={pnl.netProfit} />
        </div>

        <div className="card">
          <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
            <h2 className="text-sm font-semibold text-ink-800">Project-wise AR Aging</h2>
            <Link href={`/reports/ar-aging-summary?${reportQuery}`} className="text-xs font-medium text-brand-600 hover:underline">
              View detailed aging &rarr;
            </Link>
          </div>
          {aging.rows.length === 0 ? (
            <EmptyState text="No outstanding receivables as of this date." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="whitespace-nowrap px-4 py-2.5">Project</th>
                    <th className="whitespace-nowrap px-4 py-2.5 text-right">Current</th>
                    <th className="whitespace-nowrap px-4 py-2.5 text-right">1-30</th>
                    <th className="whitespace-nowrap px-4 py-2.5 text-right">31-60</th>
                    <th className="whitespace-nowrap px-4 py-2.5 text-right">61-90</th>
                    <th className="whitespace-nowrap px-4 py-2.5 text-right">90+</th>
                    <th className="whitespace-nowrap px-4 py-2.5 text-right">Total AR</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {aging.rows.map((r) => (
                    <tr key={r.projectId ?? "none"} className="hover:bg-gray-50">
                      <td className="whitespace-nowrap px-4 py-2.5 font-medium text-ink-800">
                        {r.projectId ? (
                          <Link href={`/projects/${r.projectId}`} className="text-brand-600 hover:underline">
                            {r.projectName}
                          </Link>
                        ) : (
                          r.projectName
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right text-ink-700">{formatCompactCurrency(r.bucket.current)}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right text-ink-700">{formatCompactCurrency(r.bucket.d1to30)}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right text-ink-700">{formatCompactCurrency(r.bucket.d31to60)}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right text-ink-700">{formatCompactCurrency(r.bucket.d61to90)}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right text-red-600">{formatCompactCurrency(r.bucket.over90)}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right font-semibold text-ink-800">
                        {formatCompactCurrency(r.bucket.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold text-ink-800">
                    <td className="whitespace-nowrap px-4 py-2.5">Total</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right">{formatCompactCurrency(aging.grand.current)}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right">{formatCompactCurrency(aging.grand.d1to30)}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right">{formatCompactCurrency(aging.grand.d31to60)}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right">{formatCompactCurrency(aging.grand.d61to90)}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right">{formatCompactCurrency(aging.grand.over90)}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right">{formatCompactCurrency(aging.grand.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink-800">Receivable Summary</h2>
              <Link href={`/reports/receivable-summary?from=${from}&to=${to}${projectId ? `&projectId=${projectId}` : ""}`} className="text-xs font-medium text-brand-600 hover:underline">
                View full report &rarr;
              </Link>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <SummaryStat label="Invoiced Amount" value={receivable.invoiced} />
              <SummaryStat label="Amount Received" value={receivable.received} />
              <SummaryStat label="Balance" value={receivable.balance} />
            </div>
            <p className="mt-4 text-xs text-gray-400">
              Invoiced Amount and Amount Received reflect activity within {formatDate(from)} to {formatDate(to)}. Balance is
              the current outstanding balance as of {formatDate(to)}.
            </p>
          </div>

          <div className="card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink-800">Customer Balance Summary</h2>
              <Link href={`/reports/customer-balance-summary?${reportQuery}`} className="text-xs font-medium text-brand-600 hover:underline">
                View all &rarr;
              </Link>
            </div>
            {customerBalances.rows.length === 0 ? (
              <EmptyState text="No customer has an outstanding balance as of this date." compact />
            ) : (
              <table className="w-full text-left text-sm">
                <tbody className="divide-y divide-gray-100">
                  {customerBalances.rows.map((r) => (
                    <tr key={r.id}>
                      <td className="py-2">
                        <Link href={`/customers/${r.id}`} className="text-brand-600 hover:underline">
                          {r.name}
                        </Link>
                      </td>
                      <td className="py-2 text-right text-ink-800">{formatCompactCurrency(r.balance)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-gray-200 font-semibold text-ink-800">
                    <td className="py-2">Total ({customerBalances.totalCount} customers)</td>
                    <td className="py-2 text-right">{formatCompactCurrency(customerBalances.total)}</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>

          <div className="card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink-800">Sales by Customers</h2>
              <Link href={`/reports/sales-by-customer?from=${from}&to=${to}${projectId ? `&projectId=${projectId}` : ""}`} className="text-xs font-medium text-brand-600 hover:underline">
                Sales report &rarr;
              </Link>
            </div>
            {customerSales.rows.length === 0 ? (
              <EmptyState text="No sales in this period." compact />
            ) : (
              <table className="w-full text-left text-sm">
                <tbody className="divide-y divide-gray-100">
                  {customerSales.rows.map((r) => (
                    <tr key={r.id ?? "none"}>
                      <td className="py-2 text-ink-700">
                        {r.id ? (
                          <Link href={`/customers/${r.id}`} className="text-brand-600 hover:underline">
                            {r.name}
                          </Link>
                        ) : (
                          r.name
                        )}
                      </td>
                      <td className="py-2 text-right text-ink-800">{formatCompactCurrency(r.total)}</td>
                      <td className="py-2 pl-3 text-right text-xs text-gray-400">
                        {customerSales.total > 0 ? `${((r.total / customerSales.total) * 100).toFixed(1)}%` : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-gray-200 font-semibold text-ink-800">
                    <td className="py-2">Total ({customerSales.totalCount} customers)</td>
                    <td className="py-2 text-right">{formatCompactCurrency(customerSales.total)}</td>
                    <td className="py-2 pl-3 text-right text-xs text-gray-400">100%</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>

          <div className="card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink-800">Profit &amp; Loss</h2>
              <Link href={`/reports/profit-and-loss?from=${from}&to=${to}${projectId ? `&projectId=${projectId}` : ""}`} className="text-xs font-medium text-brand-600 hover:underline">
                Full statement &rarr;
              </Link>
            </div>
            <table className="w-full text-left text-sm">
              <tbody className="divide-y divide-gray-100">
                <PnlLine label="Revenue" value={pnl.totalIncome} tone="pos" />
                <PnlLine label="Cost of Goods Sold" value={-pnl.totalCogs} tone="neg" />
                <PnlLine label="Gross Profit" value={pnl.grossProfit} tone="pos" bold />
                <PnlLine label="Operating Expenses" value={-pnl.totalExpenses} tone="neg" />
                <PnlLine label="Net Profit" value={pnl.netProfit} tone={pnl.netProfit >= 0 ? "pos" : "neg"} bold />
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="border-b border-gray-100 px-6 py-4">
            <h2 className="text-sm font-semibold text-ink-800">Cash Flow Statement</h2>
            <p className="text-xs text-gray-400">
              Operating Activities: {formatDate(from)} to {formatDate(to)}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <tbody className="divide-y divide-gray-100">
                <tr className="bg-gray-50">
                  <td className="px-5 py-2 font-semibold text-ink-800" colSpan={2}>
                    Operating Activities
                  </td>
                </tr>
                <tr>
                  <td className="px-5 py-2 pl-9 text-ink-700">Cash Received from Customers</td>
                  <td className="px-5 py-2 text-right text-ink-800">{formatCompactCurrency(operatingCf.receivedFromCustomers)}</td>
                </tr>
                <tr>
                  <td className="px-5 py-2 pl-9 text-ink-700">Cash Paid to Vendors</td>
                  <td className="px-5 py-2 text-right text-ink-800">{formatCompactCurrency(-operatingCf.paidToVendors)}</td>
                </tr>
                <tr>
                  <td className="px-5 py-2 pl-9 text-ink-700">Cash Paid for Expenses</td>
                  <td className="px-5 py-2 text-right text-ink-800">{formatCompactCurrency(-operatingCf.paidForExpenses)}</td>
                </tr>
                <tr className="border-t border-gray-200 font-semibold text-ink-800">
                  <td className="px-5 py-2">Net Cash from Operating Activities</td>
                  <td className="px-5 py-2 text-right">{formatCompactCurrency(operatingCf.netOperating)}</td>
                </tr>

                <tr className="bg-gray-50">
                  <td className="px-5 py-2 font-semibold text-ink-800" colSpan={2}>
                    Investing Activities &mdash; Project Other Charges
                  </td>
                </tr>
                {otherCharges.rows.length === 0 ? (
                  <tr>
                    <td className="px-5 py-2 pl-9 text-gray-400" colSpan={2}>
                      No Other Charges recorded{projectId ? " for this project" : ""}.
                    </td>
                  </tr>
                ) : (
                  otherCharges.rows.map((r) => (
                    <tr key={r.category}>
                      <td className="px-5 py-2 pl-9 text-ink-700">{r.category}</td>
                      <td className="px-5 py-2 text-right text-ink-800">{formatCompactCurrency(-r.aedMn)}</td>
                    </tr>
                  ))
                )}
                <tr className="border-t border-gray-200 font-semibold text-ink-800">
                  <td className="px-5 py-2">Net Cash from Investing Activities</td>
                  <td className="px-5 py-2 text-right">{formatCompactCurrency(-otherCharges.total)}</td>
                </tr>

                <tr className="bg-gray-50">
                  <td className="px-5 py-2 font-semibold text-ink-800" colSpan={2}>
                    Financing Activities
                  </td>
                </tr>
                <tr>
                  <td className="px-5 py-2 pl-9 text-gray-400">Not tracked in this app yet</td>
                  <td className="px-5 py-2 text-right text-ink-800">{formatCompactCurrency(0)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="px-6 pb-4 pt-3 text-xs text-gray-400">
            Operating Activities reflects real cash movement within the selected date range. Project Other Charges has no
            date of its own (it&apos;s a per-project cost allocation, not a dated transaction) — its total{" "}
            {projectId ? "for the selected project" : "across every project"} is shown here rather than filtered by the
            range above, so it is kept as its own section rather than combined into a single &ldquo;Net Change in Cash&rdquo;
            figure that would otherwise mix a period total with an all-time one.
          </p>
        </div>

        <div className="card">
          <div className="border-b border-gray-100 px-6 py-4">
            <h2 className="text-sm font-semibold text-ink-800">General Ledger Summary</h2>
            <p className="text-xs text-gray-400">As of {formatDate(to)}</p>
          </div>
          {gl.length === 0 ? (
            <EmptyState text="No account activity as of this date." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="whitespace-nowrap px-5 py-2.5">Account Category</th>
                    <th className="whitespace-nowrap px-5 py-2.5 text-right">Debit</th>
                    <th className="whitespace-nowrap px-5 py-2.5 text-right">Credit</th>
                    <th className="whitespace-nowrap px-5 py-2.5 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {gl.map((row) => (
                    <tr key={row.label}>
                      <td className="whitespace-nowrap px-5 py-2.5 text-ink-700">{row.label}</td>
                      <td className="whitespace-nowrap px-5 py-2.5 text-right text-ink-800">{formatCompactCurrency(row.debit)}</td>
                      <td className="whitespace-nowrap px-5 py-2.5 text-right text-ink-800">
                        {row.credit === 0 ? "—" : formatCompactCurrency(row.credit)}
                      </td>
                      <td className="whitespace-nowrap px-5 py-2.5 text-right font-medium text-ink-800">
                        {formatCompactCurrency(row.balance)} {row.side === "debit" ? "Dr" : "Cr"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="px-6 pb-4 pt-3 text-xs text-gray-400">
            Cumulative balance per account category through {formatDate(to)}. This is a coarser rollup than the full{" "}
            <Link href={`/reports/general-ledger?from=${from}&to=${to}${projectId ? `&projectId=${projectId}` : ""}`} className="text-brand-600 hover:underline">
              General Ledger report
            </Link>
            , which breaks every category down to the individual account.
          </p>
        </div>
      </div>
    </div>
  );
}

function KpiTile({ label, value }: { label: string; value: number }) {
  const tone = value < 0 ? "text-red-600" : "text-ink-800";
  return (
    <div className="card p-5">
      <p className="text-xs font-medium text-gray-400">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${tone}`}>{formatCompactCurrency(value)}</p>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-gray-50 px-3 py-3">
      <p className="text-xs text-gray-400">{label}</p>
      <p className="mt-1 text-sm font-semibold text-ink-800">{formatCompactCurrency(value)}</p>
    </div>
  );
}

function PnlLine({ label, value, tone, bold }: { label: string; value: number; tone: "pos" | "neg"; bold?: boolean }) {
  const color = tone === "neg" ? "text-red-600" : "text-ink-800";
  return (
    <tr className={bold ? "border-t border-gray-200 font-semibold" : ""}>
      <td className={`py-2 ${bold ? "text-ink-800" : "text-ink-700"}`}>{label}</td>
      <td className={`py-2 text-right ${color}`}>{formatCompactCurrency(value)}</td>
    </tr>
  );
}

function EmptyState({ text, compact }: { text: string; compact?: boolean }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-2 text-center ${compact ? "py-8" : "py-16"}`}>
      <TrendingUp size={compact ? 20 : 28} className="text-gray-300" />
      <p className="text-sm text-gray-500">{text}</p>
    </div>
  );
}
