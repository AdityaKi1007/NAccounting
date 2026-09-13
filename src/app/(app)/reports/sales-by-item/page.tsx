import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireActiveContext } from "@/lib/session";
import { requireModuleAccess } from "@/lib/module-access";
import { query, queryOne } from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/format";
import { defaultFiscalYearRange } from "@/lib/report-dates";
import { loadProjectUnitOptions, normalizeFilterId } from "@/lib/report-filters";
import ReportDateRangeBar from "@/components/reports/ReportDateRangeBar";

interface Row {
  item_id: string | null;
  item_name: string | null;
  quantity: string;
  amount: string;
}

export default async function SalesByItemPage({
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
    `SELECT it.id AS item_id, COALESCE(it.name, ii.description) AS item_name, SUM(ii.quantity) AS quantity, SUM(ii.amount) AS amount
     FROM invoice_items ii
     JOIN invoices i ON i.id = ii.invoice_id
     LEFT JOIN items it ON it.id = ii.item_id
     WHERE i.organization_id = $1 AND i.status NOT IN ('draft', 'void') AND i.invoice_date BETWEEN $2 AND $3
       AND ($4::uuid IS NULL OR i.project_id = $4::uuid)
       AND ($5::uuid IS NULL OR i.unit_id = $5::uuid)
     GROUP BY it.id, COALESCE(it.name, ii.description)
     ORDER BY SUM(ii.amount) DESC`,
    [ctx.orgId, from, to, projectId, unitId]
  );
  const grandTotal = rows.reduce((sum, r) => sum + Number(r.amount), 0);

  return (
    <div>
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <Link href="/reports" className="mb-1 flex items-center gap-1 text-xs text-gray-400 hover:text-brand-600">
          <ChevronLeft size={12} /> All Reports
        </Link>
        <h1 className="text-lg font-semibold text-ink-800">Sales by Item</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          {formatDate(from)} to {formatDate(to)}
        </p>
      </div>

      <ReportDateRangeBar from={from} to={to} projectId={projectId} unitId={unitId} projects={projects} units={units} />

      <div className="p-6">
        <div className="card overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-5 py-2.5">Item</th>
                <th className="px-5 py-2.5 text-right">Quantity Sold</th>
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
                  <tr key={r.item_id ?? r.item_name ?? "none"}>
                    <td className="px-5 py-2.5 text-ink-700">{r.item_name ?? "(No item)"}</td>
                    <td className="px-5 py-2.5 text-right text-ink-700">{Number(r.quantity)}</td>
                    <td className="px-5 py-2.5 text-right text-ink-800">{formatCurrency(r.amount)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold text-ink-800">
                  <td className="px-5 py-2.5">Total</td>
                  <td className="px-5 py-2.5 text-right">{rows.reduce((s, r) => s + Number(r.quantity), 0)}</td>
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
