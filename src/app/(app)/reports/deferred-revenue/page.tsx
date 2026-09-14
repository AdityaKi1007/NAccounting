import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireActiveContext } from "@/lib/session";
import { requireModuleAccess } from "@/lib/module-access";
import { query } from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/format";
import { defaultAsOfDate } from "@/lib/report-dates";
import { processDueRevenueRecognition } from "@/lib/auto-journal";
import ReportAsOfBar from "@/components/reports/ReportAsOfBar";

interface Row {
  invoice_id: string;
  invoice_number: string;
  customer_name: string;
  total_deferred: string;
  recognized_to_date: string | null;
}

// One row per invoice that has at least one Straight-Line-tagged, still-scheduled line (see
// Settings -> General -> Revenue Recognition) — how much of that invoice's income was deferred
// in total, how much of it has actually recognized (posted its own Dr Deferred Revenue / Cr
// Income journal — see processDueRevenueRecognition in auto-journal.ts) by the "as of" date,
// and what's still sitting in the Deferred Revenue liability account for it. Point-in-time,
// like Balance Sheet/AR Aging Summary — ReportAsOfBar, not a date range.
export default async function DeferredRevenuePage({
  searchParams,
}: {
  searchParams: { asOf?: string };
}) {
  const ctx = await requireActiveContext();
  await requireModuleAccess(ctx, "reports", "view");
  // Same "process due X on page load" convention as processDueJournalReversals (see
  // journal-reversals.ts) — this app has no cron, so a report reading these figures is exactly
  // the moment any period whose end date has arrived gets its real recognition journal posted.
  await processDueRevenueRecognition(ctx.orgId);

  const asOf = searchParams.asOf || defaultAsOfDate();

  const rows = await query<Row>(
    `SELECT i.id AS invoice_id, i.invoice_number, c.display_name AS customer_name,
            SUM(s.amount) AS total_deferred,
            SUM(s.amount) FILTER (WHERE s.recognized_at IS NOT NULL AND s.period_end <= $2) AS recognized_to_date
     FROM revenue_recognition_schedules s
     JOIN invoices i ON i.id = s.invoice_id
     JOIN customers c ON c.id = i.customer_id
     WHERE s.organization_id = $1
     GROUP BY i.id, i.invoice_number, c.display_name
     ORDER BY i.invoice_number`,
    [ctx.orgId, asOf]
  );

  const active = rows.map((r) => {
    const totalDeferred = Math.round(Number(r.total_deferred) * 100) / 100;
    const recognized = Math.round(Number(r.recognized_to_date ?? 0) * 100) / 100;
    const remaining = Math.max(0, Math.round((totalDeferred - recognized) * 100) / 100);
    return { invoiceId: r.invoice_id, invoiceNumber: r.invoice_number, customerName: r.customer_name, totalDeferred, recognized, remaining };
  });

  const totalDeferredAll = active.reduce((sum, r) => sum + r.totalDeferred, 0);
  const totalRecognizedAll = active.reduce((sum, r) => sum + r.recognized, 0);
  const totalRemainingAll = active.reduce((sum, r) => sum + r.remaining, 0);

  return (
    <div>
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <Link href="/reports" className="mb-1 flex items-center gap-1 text-xs text-gray-400 hover:text-brand-600">
          <ChevronLeft size={12} /> All Reports
        </Link>
        <h1 className="text-lg font-semibold text-ink-800">Deferred Revenue</h1>
        <p className="mt-0.5 text-sm text-gray-500">As of {formatDate(asOf)}</p>
      </div>

      <ReportAsOfBar asOf={asOf} />

      <div className="p-6">
        <div className="card overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="whitespace-nowrap px-5 py-2.5">Invoice #</th>
                <th className="whitespace-nowrap px-5 py-2.5">Customer</th>
                <th className="whitespace-nowrap px-5 py-2.5 text-right">Total Deferred</th>
                <th className="whitespace-nowrap px-5 py-2.5 text-right">Recognized to Date</th>
                <th className="whitespace-nowrap px-5 py-2.5 text-right">Remaining Deferred</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {active.length === 0 ? (
                <tr>
                  <td className="px-5 py-10 text-center text-gray-400" colSpan={5}>
                    No Revenue Recognition-tagged invoice lines yet.
                  </td>
                </tr>
              ) : (
                active.map((r) => (
                  <tr key={r.invoiceId}>
                    <td className="whitespace-nowrap px-5 py-2.5 text-ink-700">
                      <Link href={`/invoices/${r.invoiceId}`} className="hover:underline">
                        {r.invoiceNumber}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-ink-700">{r.customerName}</td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-right text-ink-800">{formatCurrency(r.totalDeferred)}</td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-right text-ink-800">{formatCurrency(r.recognized)}</td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-right font-medium text-ink-800">
                      {formatCurrency(r.remaining)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {active.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold text-ink-800">
                  <td className="px-5 py-2.5" colSpan={2}>
                    Total
                  </td>
                  <td className="px-5 py-2.5 text-right">{formatCurrency(totalDeferredAll)}</td>
                  <td className="px-5 py-2.5 text-right">{formatCurrency(totalRecognizedAll)}</td>
                  <td className="px-5 py-2.5 text-right">{formatCurrency(totalRemainingAll)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <p className="mt-3 text-xs text-gray-400">
          One row per invoice with at least one Straight-Line-tagged line (Settings -&gt; General -&gt; Revenue
          Recognition). Total Deferred is the full amount originally scheduled for deferral; Recognized to Date
          is however much of it has actually posted its own Dr Deferred Revenue / Cr Income journal by{" "}
          {formatDate(asOf)}; Remaining Deferred is what&apos;s still sitting in the Deferred Revenue liability
          account for that invoice.
        </p>
      </div>
    </div>
  );
}
