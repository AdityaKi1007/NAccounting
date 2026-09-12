import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireActiveContext } from "@/lib/session";
import { query, queryOne } from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/format";
import { defaultFiscalYearRange } from "@/lib/report-dates";
import ReportDateRangeBar from "@/components/reports/ReportDateRangeBar";

interface Row {
  id: string;
  display_name: string;
  invoiced_amount: string;
  amount_received: string;
  opening_balance: string;
  balance: string;
}

// Per-customer breakdown for the period: Invoiced Amount and Amount Received are period
// figures (what was raised / collected between from and to); Balance is the customer's
// current outstanding balance as of `to` (opening_balance + every non-draft/non-void
// invoice's balance_due through that date) — not just the period's own net movement, matching
// how Zoho's own Receivable Summary reads "Balance" as a running total, not a period delta.
export default async function ReceivableSummaryPage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string };
}) {
  const ctx = await requireActiveContext();
  const org = await queryOne<{ fiscal_year_start: string | null }>(
    `SELECT fiscal_year_start FROM organizations WHERE id = $1`,
    [ctx.orgId]
  );
  const defaults = defaultFiscalYearRange(org?.fiscal_year_start);
  const from = searchParams.from || defaults.from;
  const to = searchParams.to || defaults.to;

  const rows = await query<Row>(
    `SELECT c.id, c.display_name, c.opening_balance,
            COALESCE((
              SELECT SUM(i.total) FROM invoices i
              WHERE i.customer_id = c.id AND i.status NOT IN ('draft', 'void') AND i.invoice_date BETWEEN $2 AND $3
            ), 0) AS invoiced_amount,
            COALESCE((
              SELECT SUM(p.amount) FROM payments_received p
              WHERE p.customer_id = c.id AND p.status != 'draft' AND p.payment_date BETWEEN $2 AND $3
            ), 0) AS amount_received,
            COALESCE((
              SELECT SUM(i.balance_due) FROM invoices i
              WHERE i.customer_id = c.id AND i.status NOT IN ('draft', 'void') AND i.invoice_date <= $3
            ), 0) AS balance
     FROM customers c
     WHERE c.organization_id = $1
     ORDER BY c.display_name`,
    [ctx.orgId, from, to]
  );

  const active = rows
    .map((r) => ({ ...r, closingBalance: Number(r.opening_balance) + Number(r.balance) }))
    .filter((r) => Number(r.invoiced_amount) !== 0 || Number(r.amount_received) !== 0 || Math.abs(r.closingBalance) > 0.005)
    .sort((a, b) => Number(b.invoiced_amount) - Number(a.invoiced_amount));

  const totalInvoiced = active.reduce((sum, r) => sum + Number(r.invoiced_amount), 0);
  const totalReceived = active.reduce((sum, r) => sum + Number(r.amount_received), 0);
  const totalBalance = active.reduce((sum, r) => sum + r.closingBalance, 0);

  return (
    <div>
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <Link href="/reports" className="mb-1 flex items-center gap-1 text-xs text-gray-400 hover:text-brand-600">
          <ChevronLeft size={12} /> All Reports
        </Link>
        <h1 className="text-lg font-semibold text-ink-800">Receivable Summary</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          {formatDate(from)} to {formatDate(to)}
        </p>
      </div>

      <ReportDateRangeBar from={from} to={to} />

      <div className="p-6">
        <div className="card overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-5 py-2.5">Customer Name</th>
                <th className="px-5 py-2.5 text-right">Invoiced Amount</th>
                <th className="px-5 py-2.5 text-right">Amount Received</th>
                <th className="px-5 py-2.5 text-right">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {active.length === 0 ? (
                <tr>
                  <td className="px-5 py-10 text-center text-gray-400" colSpan={4}>
                    No receivables activity in this period.
                  </td>
                </tr>
              ) : (
                active.map((r) => (
                  <tr key={r.id}>
                    <td className="px-5 py-2.5">
                      <Link href={`/customers/${r.id}`} className="font-medium text-brand-600 hover:underline">
                        {r.display_name}
                      </Link>
                    </td>
                    <td className="px-5 py-2.5 text-right text-ink-800">{formatCurrency(r.invoiced_amount)}</td>
                    <td className="px-5 py-2.5 text-right text-ink-800">{formatCurrency(r.amount_received)}</td>
                    <td className="px-5 py-2.5 text-right text-ink-800">{formatCurrency(r.closingBalance)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {active.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold text-ink-800">
                  <td className="px-5 py-2.5">Total</td>
                  <td className="px-5 py-2.5 text-right">{formatCurrency(totalInvoiced)}</td>
                  <td className="px-5 py-2.5 text-right">{formatCurrency(totalReceived)}</td>
                  <td className="px-5 py-2.5 text-right">{formatCurrency(totalBalance)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <p className="mt-3 text-xs text-gray-400">
          Invoiced Amount and Amount Received reflect activity within the selected period. Balance is each
          customer&apos;s current outstanding balance as of {formatDate(to)}, including their Opening Balance.
        </p>
      </div>
    </div>
  );
}
