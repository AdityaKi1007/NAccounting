import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireActiveContext } from "@/lib/session";
import { query, queryOne } from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/format";
import { defaultFiscalYearRange } from "@/lib/report-dates";
import ReportDateRangeBar from "@/components/reports/ReportDateRangeBar";

interface Row {
  customer_id: string | null;
  customer_name: string | null;
  invoice_count: string;
  total: string;
}

export default async function SalesByCustomerPage({
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

  // Draft/Void invoices aren't real sales yet — same "posted revenue" boundary
  // syncInvoiceJournal uses (see auto-journal.ts).
  const rows = await query<Row>(
    `SELECT c.id AS customer_id, c.display_name AS customer_name, count(i.id) AS invoice_count, SUM(i.total) AS total
     FROM invoices i
     LEFT JOIN customers c ON c.id = i.customer_id
     WHERE i.organization_id = $1 AND i.status NOT IN ('draft', 'void') AND i.invoice_date BETWEEN $2 AND $3
     GROUP BY c.id, c.display_name
     ORDER BY SUM(i.total) DESC`,
    [ctx.orgId, from, to]
  );
  const grandTotal = rows.reduce((sum, r) => sum + Number(r.total), 0);

  return (
    <div>
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <Link href="/reports" className="mb-1 flex items-center gap-1 text-xs text-gray-400 hover:text-brand-600">
          <ChevronLeft size={12} /> All Reports
        </Link>
        <h1 className="text-lg font-semibold text-ink-800">Sales by Customer</h1>
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
                <th className="px-5 py-2.5">Customer</th>
                <th className="px-5 py-2.5 text-right">Invoices</th>
                <th className="px-5 py-2.5 text-right">Total Sales</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.length === 0 ? (
                <tr>
                  <td className="px-5 py-10 text-center text-gray-400" colSpan={3}>
                    No sales in this period.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.customer_id ?? "none"}>
                    <td className="px-5 py-2.5 text-ink-700">{r.customer_name ?? "(No customer)"}</td>
                    <td className="px-5 py-2.5 text-right text-ink-700">{r.invoice_count}</td>
                    <td className="px-5 py-2.5 text-right text-ink-800">{formatCurrency(r.total)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold text-ink-800">
                  <td className="px-5 py-2.5">Total</td>
                  <td className="px-5 py-2.5 text-right">{rows.reduce((s, r) => s + Number(r.invoice_count), 0)}</td>
                  <td className="px-5 py-2.5 text-right">{formatCurrency(grandTotal)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
