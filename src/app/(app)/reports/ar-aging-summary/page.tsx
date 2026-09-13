import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireActiveContext } from "@/lib/session";
import { requireModuleAccess } from "@/lib/module-access";
import { query } from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/format";
import { defaultAsOfDate } from "@/lib/report-dates";
import { loadProjectUnitOptions, normalizeFilterId } from "@/lib/report-filters";
import ReportAsOfBar from "@/components/reports/ReportAsOfBar";

interface Row {
  customer_id: string | null;
  customer_name: string | null;
  invoice_id: string;
  invoice_number: string;
  due_date: string | null;
  balance_due: string;
}

interface CustomerAging {
  customerId: string | null;
  customerName: string;
  current: number;
  days1to30: number;
  days31to60: number;
  days61to90: number;
  over90: number;
  total: number;
}

// Unpaid/partially-paid invoices as of the given date, bucketed by how many days past their
// due date they are. Invoices with no due date are treated as Current (not yet aged) — matches
// Zoho's convention of aging strictly from the due date, not the invoice date.
export default async function ARAgingSummaryPage({
  searchParams,
}: {
  searchParams: { asOf?: string; projectId?: string; unitId?: string };
}) {
  const ctx = await requireActiveContext();
  await requireModuleAccess(ctx, "reports", "view");
  const asOf = searchParams.asOf || defaultAsOfDate();
  const projectId = normalizeFilterId(searchParams.projectId);
  const unitId = normalizeFilterId(searchParams.unitId);
  const { projects, units } = await loadProjectUnitOptions(ctx.orgId);

  const rows = await query<Row>(
    `SELECT c.id AS customer_id, c.display_name AS customer_name, i.id AS invoice_id, i.invoice_number,
            i.due_date, i.balance_due
     FROM invoices i
     LEFT JOIN customers c ON c.id = i.customer_id
     WHERE i.organization_id = $1 AND i.status NOT IN ('draft', 'void') AND i.balance_due > 0.005
       AND i.invoice_date <= $2
       AND ($3::uuid IS NULL OR i.project_id = $3::uuid)
       AND ($4::uuid IS NULL OR i.unit_id = $4::uuid)
     ORDER BY c.display_name NULLS LAST`,
    [ctx.orgId, asOf, projectId, unitId]
  );

  const asOfDate = new Date(asOf + "T00:00:00Z");
  const byCustomer = new Map<string, CustomerAging>();

  for (const r of rows) {
    const key = r.customer_id ?? "none";
    if (!byCustomer.has(key)) {
      byCustomer.set(key, {
        customerId: r.customer_id,
        customerName: r.customer_name ?? "(No customer)",
        current: 0,
        days1to30: 0,
        days31to60: 0,
        days61to90: 0,
        over90: 0,
        total: 0,
      });
    }
    const bucket = byCustomer.get(key)!;
    const balance = Number(r.balance_due);
    let daysPastDue = -1;
    if (r.due_date) {
      // pg returns DATE columns as JS Date objects (not strings) despite the `string | null`
      // type above — pass the value straight to `new Date(...)` rather than string-concatenating
      // it, which would corrupt a Date object's stringified form and silently produce an
      // Invalid Date (whose NaN comparisons always fall through to the "over 90 days" bucket).
      const due = new Date(r.due_date);
      daysPastDue = Math.floor((asOfDate.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
    }
    if (daysPastDue <= 0) bucket.current += balance;
    else if (daysPastDue <= 30) bucket.days1to30 += balance;
    else if (daysPastDue <= 60) bucket.days31to60 += balance;
    else if (daysPastDue <= 90) bucket.days61to90 += balance;
    else bucket.over90 += balance;
    bucket.total += balance;
  }

  const customers = Array.from(byCustomer.values()).sort((a, b) => b.total - a.total);
  const grand = customers.reduce(
    (acc, c) => ({
      current: acc.current + c.current,
      days1to30: acc.days1to30 + c.days1to30,
      days31to60: acc.days31to60 + c.days31to60,
      days61to90: acc.days61to90 + c.days61to90,
      over90: acc.over90 + c.over90,
      total: acc.total + c.total,
    }),
    { current: 0, days1to30: 0, days31to60: 0, days61to90: 0, over90: 0, total: 0 }
  );

  return (
    <div>
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <Link href="/reports" className="mb-1 flex items-center gap-1 text-xs text-gray-400 hover:text-brand-600">
          <ChevronLeft size={12} /> All Reports
        </Link>
        <h1 className="text-lg font-semibold text-ink-800">AR Aging Summary</h1>
        <p className="mt-0.5 text-sm text-gray-500">As of {formatDate(asOf)}</p>
      </div>

      <ReportAsOfBar asOf={asOf} projectId={projectId} unitId={unitId} projects={projects} units={units} />

      <div className="p-6">
        <div className="card overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="whitespace-nowrap px-5 py-2.5">Customer Name</th>
                <th className="whitespace-nowrap px-5 py-2.5 text-right">Current</th>
                <th className="whitespace-nowrap px-5 py-2.5 text-right">1 - 30 Days</th>
                <th className="whitespace-nowrap px-5 py-2.5 text-right">31 - 60 Days</th>
                <th className="whitespace-nowrap px-5 py-2.5 text-right">61 - 90 Days</th>
                <th className="whitespace-nowrap px-5 py-2.5 text-right">Over 90 Days</th>
                <th className="whitespace-nowrap px-5 py-2.5 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {customers.length === 0 ? (
                <tr>
                  <td className="px-5 py-10 text-center text-gray-400" colSpan={7}>
                    No outstanding receivables as of this date.
                  </td>
                </tr>
              ) : (
                customers.map((c) => (
                  <tr key={c.customerId ?? "none"}>
                    <td className="whitespace-nowrap px-5 py-2.5 text-ink-700">{c.customerName}</td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-right text-ink-800">
                      {formatCurrency(c.current)}
                    </td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-right text-ink-800">
                      {formatCurrency(c.days1to30)}
                    </td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-right text-ink-800">
                      {formatCurrency(c.days31to60)}
                    </td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-right text-ink-800">
                      {formatCurrency(c.days61to90)}
                    </td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-right text-ink-800">
                      {formatCurrency(c.over90)}
                    </td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-right font-medium text-ink-800">
                      {formatCurrency(c.total)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {customers.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold text-ink-800">
                  <td className="whitespace-nowrap px-5 py-2.5">Total</td>
                  <td className="whitespace-nowrap px-5 py-2.5 text-right">{formatCurrency(grand.current)}</td>
                  <td className="whitespace-nowrap px-5 py-2.5 text-right">{formatCurrency(grand.days1to30)}</td>
                  <td className="whitespace-nowrap px-5 py-2.5 text-right">{formatCurrency(grand.days31to60)}</td>
                  <td className="whitespace-nowrap px-5 py-2.5 text-right">{formatCurrency(grand.days61to90)}</td>
                  <td className="whitespace-nowrap px-5 py-2.5 text-right">{formatCurrency(grand.over90)}</td>
                  <td className="whitespace-nowrap px-5 py-2.5 text-right">{formatCurrency(grand.total)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
