import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireActiveContext } from "@/lib/session";
import { query } from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/format";
import { defaultAsOfDate } from "@/lib/report-dates";
import ReportAsOfBar from "@/components/reports/ReportAsOfBar";

interface Row {
  id: string;
  display_name: string;
  currency: string;
  opening_balance: string;
  invoices_balance: string;
}

// Each customer's current outstanding balance as of a date: opening_balance (captured on the
// customer record, see the Opening Balances settings feature) plus every non-draft/non-void
// invoice's balance_due raised on or before that date. Simpler than Receivable Summary (no
// period activity breakdown) and simpler than AR Aging Summary (no age buckets) — this is
// just "who owes us how much, right now."
export default async function CustomerBalanceSummaryPage({ searchParams }: { searchParams: { asOf?: string } }) {
  const ctx = await requireActiveContext();
  const asOf = searchParams.asOf || defaultAsOfDate();

  const rows = await query<Row>(
    `SELECT c.id, c.display_name, c.currency, c.opening_balance,
            COALESCE((
              SELECT SUM(i.balance_due) FROM invoices i
              WHERE i.customer_id = c.id AND i.status NOT IN ('draft', 'void') AND i.invoice_date <= $2
            ), 0) AS invoices_balance
     FROM customers c
     WHERE c.organization_id = $1
     ORDER BY c.display_name`,
    [ctx.orgId, asOf]
  );

  const withBalance = rows
    .map((r) => ({ ...r, balance: Number(r.opening_balance) + Number(r.invoices_balance) }))
    .filter((r) => Math.abs(r.balance) > 0.005)
    .sort((a, b) => b.balance - a.balance);

  const total = withBalance.reduce((sum, r) => sum + r.balance, 0);

  return (
    <div>
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <Link href="/reports" className="mb-1 flex items-center gap-1 text-xs text-gray-400 hover:text-brand-600">
          <ChevronLeft size={12} /> All Reports
        </Link>
        <h1 className="text-lg font-semibold text-ink-800">Customer Balance Summary</h1>
        <p className="mt-0.5 text-sm text-gray-500">As of {formatDate(asOf)}</p>
      </div>

      <ReportAsOfBar asOf={asOf} />

      <div className="p-6">
        <div className="card overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-5 py-2.5">Customer Name</th>
                <th className="px-5 py-2.5">Currency</th>
                <th className="px-5 py-2.5 text-right">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {withBalance.length === 0 ? (
                <tr>
                  <td className="px-5 py-10 text-center text-gray-400" colSpan={3}>
                    No customer has an outstanding balance as of this date.
                  </td>
                </tr>
              ) : (
                withBalance.map((r) => (
                  <tr key={r.id}>
                    <td className="px-5 py-2.5">
                      <Link href={`/customers/${r.id}`} className="font-medium text-brand-600 hover:underline">
                        {r.display_name}
                      </Link>
                    </td>
                    <td className="px-5 py-2.5 text-ink-700">{r.currency}</td>
                    <td className="px-5 py-2.5 text-right text-ink-800">{formatCurrency(r.balance)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {withBalance.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold text-ink-800">
                  <td className="px-5 py-2.5" colSpan={2}>
                    Total
                  </td>
                  <td className="px-5 py-2.5 text-right">{formatCurrency(total)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
