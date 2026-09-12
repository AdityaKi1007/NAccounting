import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireActiveContext } from "@/lib/session";
import { requireModuleAccess } from "@/lib/module-access";
import { query, queryOne } from "@/lib/db";
import { formatCurrency, formatDate, titleCase } from "@/lib/format";
import { defaultFiscalYearRange } from "@/lib/report-dates";
import ReportDateRangeBar from "@/components/reports/ReportDateRangeBar";

interface Row {
  id: string;
  payment_number: string;
  payment_date: string;
  vendor_name: string | null;
  payment_mode: string;
  status: string;
  amount: string;
  bill_numbers: string | null;
}

// AP-side mirror of the Payments Received report — every payment made in the period, one row
// per payment, with every bill it was allocated to (via bill_payment_allocations, the
// multi-bill settlement feature) comma-joined rather than split into multiple rows.
export default async function PaymentsMadeReportPage({
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

  const rows = await query<Row>(
    `SELECT p.id, p.payment_number, p.payment_date, v.display_name AS vendor_name, p.payment_mode,
            p.status, p.amount,
            (
              SELECT string_agg(b.bill_number, ', ' ORDER BY b.bill_number)
              FROM bill_payment_allocations bpa JOIN bills b ON b.id = bpa.bill_id
              WHERE bpa.payment_made_id = p.id
            ) AS bill_numbers
     FROM payments_made p
     LEFT JOIN vendors v ON v.id = p.vendor_id
     WHERE p.organization_id = $1 AND p.payment_date BETWEEN $2 AND $3
     ORDER BY p.payment_date, p.payment_number`,
    [ctx.orgId, from, to]
  );

  const total = rows.reduce((sum, r) => sum + Number(r.amount), 0);

  return (
    <div>
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <Link href="/reports" className="mb-1 flex items-center gap-1 text-xs text-gray-400 hover:text-brand-600">
          <ChevronLeft size={12} /> All Reports
        </Link>
        <h1 className="text-lg font-semibold text-ink-800">Payments Made</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          {formatDate(from)} to {formatDate(to)}
        </p>
      </div>

      <ReportDateRangeBar from={from} to={to} />

      <div className="p-6">
        <div className="card overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="whitespace-nowrap px-5 py-2.5">Date</th>
                <th className="whitespace-nowrap px-5 py-2.5">Payment #</th>
                <th className="whitespace-nowrap px-5 py-2.5">Vendor Name</th>
                <th className="whitespace-nowrap px-5 py-2.5">Bill(s)</th>
                <th className="whitespace-nowrap px-5 py-2.5">Payment Mode</th>
                <th className="whitespace-nowrap px-5 py-2.5">Status</th>
                <th className="whitespace-nowrap px-5 py-2.5 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.length === 0 ? (
                <tr>
                  <td className="px-5 py-10 text-center text-gray-400" colSpan={7}>
                    No payments made in this period.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap px-5 py-2.5 text-ink-700">{formatDate(r.payment_date)}</td>
                    <td className="whitespace-nowrap px-5 py-2.5">
                      <Link href={`/payments-made/${r.id}`} className="font-medium text-brand-600 hover:underline">
                        {r.payment_number}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-ink-700">{r.vendor_name ?? "-"}</td>
                    <td className="px-5 py-2.5 text-ink-700">{r.bill_numbers ?? "-"}</td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-ink-700">{titleCase(r.payment_mode)}</td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-ink-700">{titleCase(r.status)}</td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-right text-ink-800">
                      {formatCurrency(r.amount)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold text-ink-800">
                  <td className="px-5 py-2.5" colSpan={6}>
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
