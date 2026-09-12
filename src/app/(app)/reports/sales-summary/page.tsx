import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireActiveContext } from "@/lib/session";
import { requireModuleAccess } from "@/lib/module-access";
import { query, queryOne } from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/format";
import { defaultFiscalYearRange } from "@/lib/report-dates";
import ReportDateRangeBar from "@/components/reports/ReportDateRangeBar";

interface StatusRow {
  status: string;
  invoice_count: string;
  subtotal: string;
  tax_total: string;
  total: string;
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  viewed: "Viewed",
  overdue: "Overdue",
  paid: "Paid",
  partially_paid: "Partially Paid",
  void: "Void",
};

export default async function SalesSummaryPage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string };
}) {
  const ctx = await requireActiveContext();
  await requireModuleAccess(ctx, "reports", "view");
  const org = await queryOne<{ fiscal_year_start: string | null }>(
    `SELECT fiscal_year_start FROM organizations WHERE id = $1`,
    [ctx.orgId]
  );
  const defaults = defaultFiscalYearRange(org?.fiscal_year_start);
  const from = searchParams.from || defaults.from;
  const to = searchParams.to || defaults.to;

  // All invoices in the period, broken down by status — draft/void included here (unlike the
  // other Sales reports) since this report's purpose is to show the full picture of what was
  // raised, not just posted revenue.
  const rows = await query<StatusRow>(
    `SELECT status, count(*) AS invoice_count, SUM(subtotal) AS subtotal, SUM(tax_total) AS tax_total, SUM(total) AS total
     FROM invoices
     WHERE organization_id = $1 AND invoice_date BETWEEN $2 AND $3
     GROUP BY status
     ORDER BY SUM(total) DESC`,
    [ctx.orgId, from, to]
  );

  const salesRows = rows.filter((r) => r.status !== "draft" && r.status !== "void");
  const totalSales = salesRows.reduce((sum, r) => sum + Number(r.total), 0);
  const totalInvoiceCount = rows.reduce((sum, r) => sum + Number(r.invoice_count), 0);
  const totalSubtotal = salesRows.reduce((sum, r) => sum + Number(r.subtotal), 0);
  const totalTax = salesRows.reduce((sum, r) => sum + Number(r.tax_total), 0);

  return (
    <div>
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <Link href="/reports" className="mb-1 flex items-center gap-1 text-xs text-gray-400 hover:text-brand-600">
          <ChevronLeft size={12} /> All Reports
        </Link>
        <h1 className="text-lg font-semibold text-ink-800">Sales Summary</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          {formatDate(from)} to {formatDate(to)}
        </p>
      </div>

      <ReportDateRangeBar from={from} to={to} />

      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="card p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Total Sales</p>
            <p className="mt-1 text-2xl font-semibold text-ink-800">{formatCurrency(totalSales)}</p>
          </div>
          <div className="card p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Total Invoices</p>
            <p className="mt-1 text-2xl font-semibold text-ink-800">{totalInvoiceCount}</p>
          </div>
          <div className="card p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Total Tax Collected</p>
            <p className="mt-1 text-2xl font-semibold text-ink-800">{formatCurrency(totalTax)}</p>
          </div>
        </div>

        <div className="card overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-5 py-2.5">Status</th>
                <th className="px-5 py-2.5 text-right">Invoices</th>
                <th className="px-5 py-2.5 text-right">Subtotal</th>
                <th className="px-5 py-2.5 text-right">Tax</th>
                <th className="px-5 py-2.5 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.length === 0 ? (
                <tr>
                  <td className="px-5 py-10 text-center text-gray-400" colSpan={5}>
                    No invoices in this period.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.status}>
                    <td className="px-5 py-2.5 text-ink-700">{STATUS_LABELS[r.status] ?? r.status}</td>
                    <td className="px-5 py-2.5 text-right text-ink-700">{r.invoice_count}</td>
                    <td className="px-5 py-2.5 text-right text-ink-800">{formatCurrency(r.subtotal)}</td>
                    <td className="px-5 py-2.5 text-right text-ink-800">{formatCurrency(r.tax_total)}</td>
                    <td className="px-5 py-2.5 text-right text-ink-800">{formatCurrency(r.total)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold text-ink-800">
                  <td className="px-5 py-2.5">Total</td>
                  <td className="px-5 py-2.5 text-right">{totalInvoiceCount}</td>
                  <td className="px-5 py-2.5 text-right">{formatCurrency(totalSubtotal)}</td>
                  <td className="px-5 py-2.5 text-right">{formatCurrency(totalTax)}</td>
                  <td className="px-5 py-2.5 text-right">{formatCurrency(totalSales)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <p className="text-xs text-gray-400">
          Totals above (Total Sales, Total Tax Collected, and the table footer) exclude Draft and Void invoices.
          The status breakdown table includes every invoice raised in the period.
        </p>
      </div>
    </div>
  );
}
