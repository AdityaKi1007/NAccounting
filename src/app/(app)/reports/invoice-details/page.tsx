import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireActiveContext } from "@/lib/session";
import { requireModuleAccess } from "@/lib/module-access";
import { query, queryOne } from "@/lib/db";
import { formatCurrency, formatDate, titleCase } from "@/lib/format";
import { defaultFiscalYearRange } from "@/lib/report-dates";
import { loadProjectUnitOptions, normalizeFilterId } from "@/lib/report-filters";
import ReportDateRangeBar from "@/components/reports/ReportDateRangeBar";

interface Row {
  id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  status: string;
  customer_name: string | null;
  total: string;
  balance_due: string;
  project_name: string | null;
  unit_name: string | null;
}

// A flat, row-per-invoice listing for the period — every invoice raised, whatever its status
// (including Draft/Void), unlike Sales Summary's posted-revenue-only totals. This is the
// detail view a user drills into from Sales Summary's status breakdown.
export default async function InvoiceDetailsPage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string; projectId?: string; unitId?: string };
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
  const projectId = normalizeFilterId(searchParams.projectId);
  const unitId = normalizeFilterId(searchParams.unitId);
  const { projects, units } = await loadProjectUnitOptions(ctx.orgId);

  const rows = await query<Row>(
    `SELECT i.id, i.invoice_number, i.invoice_date, i.due_date, i.status, c.display_name AS customer_name,
            i.total, i.balance_due, p.name AS project_name, u.name AS unit_name
     FROM invoices i
     LEFT JOIN customers c ON c.id = i.customer_id
     LEFT JOIN projects p ON p.id = i.project_id
     LEFT JOIN inventory u ON u.id = i.unit_id
     WHERE i.organization_id = $1 AND i.invoice_date BETWEEN $2 AND $3
       AND ($4::uuid IS NULL OR i.project_id = $4::uuid)
       AND ($5::uuid IS NULL OR i.unit_id = $5::uuid)
     ORDER BY i.invoice_date, i.invoice_number`,
    [ctx.orgId, from, to, projectId, unitId]
  );

  const totalAmount = rows.reduce((sum, r) => sum + Number(r.total), 0);
  const totalBalanceDue = rows.reduce((sum, r) => sum + Number(r.balance_due), 0);

  return (
    <div>
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <Link href="/reports" className="mb-1 flex items-center gap-1 text-xs text-gray-400 hover:text-brand-600">
          <ChevronLeft size={12} /> All Reports
        </Link>
        <h1 className="text-lg font-semibold text-ink-800">Invoice Details</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          {formatDate(from)} to {formatDate(to)}
        </p>
      </div>

      <ReportDateRangeBar from={from} to={to} projectId={projectId} unitId={unitId} projects={projects} units={units} />

      <div className="p-6">
        <div className="card overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="whitespace-nowrap px-5 py-2.5">Date</th>
                <th className="whitespace-nowrap px-5 py-2.5">Invoice #</th>
                <th className="whitespace-nowrap px-5 py-2.5">Customer Name</th>
                <th className="whitespace-nowrap px-5 py-2.5">Project</th>
                <th className="whitespace-nowrap px-5 py-2.5">Unit</th>
                <th className="whitespace-nowrap px-5 py-2.5">Due Date</th>
                <th className="whitespace-nowrap px-5 py-2.5">Status</th>
                <th className="whitespace-nowrap px-5 py-2.5 text-right">Amount</th>
                <th className="whitespace-nowrap px-5 py-2.5 text-right">Balance Due</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.length === 0 ? (
                <tr>
                  <td className="px-5 py-10 text-center text-gray-400" colSpan={9}>
                    No invoices in this period.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap px-5 py-2.5 text-ink-700">{formatDate(r.invoice_date)}</td>
                    <td className="whitespace-nowrap px-5 py-2.5">
                      <Link href={`/invoices/${r.id}`} className="font-medium text-brand-600 hover:underline">
                        {r.invoice_number}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-ink-700">{r.customer_name ?? "-"}</td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-ink-700">{r.project_name ?? "-"}</td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-ink-700">{r.unit_name ?? "-"}</td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-ink-700">{formatDate(r.due_date)}</td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-ink-700">{titleCase(r.status)}</td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-right text-ink-800">
                      {formatCurrency(r.total)}
                    </td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-right text-ink-800">
                      {formatCurrency(r.balance_due)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold text-ink-800">
                  <td className="px-5 py-2.5" colSpan={7}>
                    Total
                  </td>
                  <td className="px-5 py-2.5 text-right">{formatCurrency(totalAmount)}</td>
                  <td className="px-5 py-2.5 text-right">{formatCurrency(totalBalanceDue)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
