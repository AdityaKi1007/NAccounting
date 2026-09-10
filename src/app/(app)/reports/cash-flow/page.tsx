import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireActiveContext } from "@/lib/session";
import { query, queryOne } from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/format";
import { defaultFiscalYearRange } from "@/lib/report-dates";
import { processDueJournalReversals } from "@/lib/journal-reversals";
import ReportDateRangeBar from "@/components/reports/ReportDateRangeBar";

const CASH_TYPES = ["cash", "bank"];

// Every journal line touching a Cash/Bank account is traced back to exactly one of these
// three sources — see auto-journal.ts: Payments Received debit the bank (money in), Payments
// Made and Expenses credit it (money out). Nothing else in this app posts to a cash account,
// so summing by which link column its journal carries gives an exact, directly-sourced cash
// flow breakdown rather than an estimate. Everything is shown under Operating Activities —
// this app has no fixed-asset purchases or financing transactions (loans, owner draws) to
// separate into Investing/Financing sections.
async function cashMovement(orgId: string, from: string, to: string, linkColumn: string, direction: "debit" | "credit") {
  const result = await queryOne<{ total: string | null }>(
    `SELECT SUM(jl.${direction}) AS total
     FROM journal_lines jl
     JOIN manual_journals mj ON mj.id = jl.journal_id
     JOIN accounts a ON a.id = jl.account_id
     WHERE mj.organization_id = $1 AND mj.status = 'published' AND mj.journal_date BETWEEN $2 AND $3
       AND a.type = ANY($4::text[]) AND mj.${linkColumn} IS NOT NULL`,
    [orgId, from, to, CASH_TYPES]
  );
  return Number(result?.total ?? 0);
}

async function cumulativeCashBalance(orgId: string, throughDate: string) {
  const result = await queryOne<{ total: string | null }>(
    `SELECT SUM(jl.debit - jl.credit) AS total
     FROM journal_lines jl
     JOIN manual_journals mj ON mj.id = jl.journal_id
     JOIN accounts a ON a.id = jl.account_id
     WHERE mj.organization_id = $1 AND mj.status = 'published' AND mj.journal_date <= $2 AND a.type = ANY($3::text[])`,
    [orgId, throughDate, CASH_TYPES]
  );
  return Number(result?.total ?? 0);
}

export default async function CashFlowPage({ searchParams }: { searchParams: { from?: string; to?: string } }) {
  const ctx = await requireActiveContext();
  await processDueJournalReversals(ctx.orgId);
  const org = await queryOne<{ fiscal_year_start: string | null }>(
    `SELECT fiscal_year_start FROM organizations WHERE id = $1`,
    [ctx.orgId]
  );
  const defaults = defaultFiscalYearRange(org?.fiscal_year_start);
  const from = searchParams.from || defaults.from;
  const to = searchParams.to || defaults.to;

  const dayBefore = new Date(from);
  dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
  const beginningDate = dayBefore.toISOString().slice(0, 10);

  const [receivedFromCustomers, paidToVendors, paidForExpenses, beginningCash, endingCash] = await Promise.all([
    cashMovement(ctx.orgId, from, to, "payment_id", "debit"),
    cashMovement(ctx.orgId, from, to, "payment_made_id", "credit"),
    cashMovement(ctx.orgId, from, to, "expense_id", "credit"),
    cumulativeCashBalance(ctx.orgId, beginningDate),
    cumulativeCashBalance(ctx.orgId, to),
  ]);

  const netChange = receivedFromCustomers - paidToVendors - paidForExpenses;

  return (
    <div>
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <Link href="/reports" className="mb-1 flex items-center gap-1 text-xs text-gray-400 hover:text-brand-600">
          <ChevronLeft size={12} /> All Reports
        </Link>
        <h1 className="text-lg font-semibold text-ink-800">Cash Flow Statement</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          {formatDate(from)} to {formatDate(to)}
        </p>
      </div>

      <ReportDateRangeBar from={from} to={to} />

      <div className="p-6">
        <div className="card overflow-hidden">
          <table className="w-full text-left text-sm">
            <tbody className="divide-y divide-gray-100">
              <tr className="bg-gray-50">
                <td className="px-5 py-2 font-semibold text-ink-800" colSpan={2}>
                  Operating Activities
                </td>
              </tr>
              <tr>
                <td className="px-5 py-2 pl-9 text-ink-700">Cash Received from Customers</td>
                <td className="px-5 py-2 text-right text-ink-800">{formatCurrency(receivedFromCustomers)}</td>
              </tr>
              <tr>
                <td className="px-5 py-2 pl-9 text-ink-700">Cash Paid to Vendors</td>
                <td className="px-5 py-2 text-right text-ink-800">{formatCurrency(-paidToVendors)}</td>
              </tr>
              <tr>
                <td className="px-5 py-2 pl-9 text-ink-700">Cash Paid for Expenses</td>
                <td className="px-5 py-2 text-right text-ink-800">{formatCurrency(-paidForExpenses)}</td>
              </tr>
              <tr className="border-t border-gray-200 font-semibold text-ink-800">
                <td className="px-5 py-2">Net Cash from Operating Activities</td>
                <td className="px-5 py-2 text-right">{formatCurrency(netChange)}</td>
              </tr>

              <tr className="border-t-2 border-gray-300">
                <td className="px-5 py-2.5 text-ink-700">Beginning Cash Balance ({formatDate(beginningDate)})</td>
                <td className="px-5 py-2.5 text-right text-ink-800">{formatCurrency(beginningCash)}</td>
              </tr>
              <tr>
                <td className="px-5 py-2.5 text-ink-700">Net Change in Cash</td>
                <td className="px-5 py-2.5 text-right text-ink-800">{formatCurrency(netChange)}</td>
              </tr>
              <tr className="border-t-2 border-gray-300 bg-gray-50 text-base font-bold text-ink-800">
                <td className="px-5 py-3">Ending Cash Balance ({formatDate(to)})</td>
                <td className="px-5 py-3 text-right">{formatCurrency(endingCash)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
