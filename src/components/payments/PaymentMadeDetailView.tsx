"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Pencil, Download, Printer } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { generatePdfBlob, downloadPdfBlob } from "@/lib/pdf-export";
import JournalPanel, { type JournalLineData } from "@/components/accounting/JournalPanel";
import AttachmentsField from "@/components/attachments/AttachmentsField";

interface PaymentData {
  id: string;
  paymentNumber: string;
  paymentDate: string;
  amount: number;
  paymentMode: string;
  referenceNumber: string | null;
  status: string;
  notes: string | null;
}

interface AllocationData {
  billId: string;
  billNumber: string;
  billTotal: number;
  amount: number;
}

function paymentModeLabel(mode: string) {
  return mode
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** The vendor-side mirror of PaymentDetailView.tsx (payments received) — read-only detail
 * view at /payments-made/[id], reached from the list or right after Save. */
export default function PaymentMadeDetailView({
  payment,
  vendorName,
  vendorAddressLines,
  bankAccountName,
  org,
  allocations,
  journalLines,
  currency,
}: {
  payment: PaymentData;
  vendorName: string;
  vendorAddressLines: string[];
  bankAccountName: string;
  org: { name: string; addressLines: string[] };
  allocations: AllocationData[];
  journalLines: JournalLineData[];
  currency: string;
}) {
  const printRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  const totalApplied = allocations.reduce((sum, a) => sum + a.amount, 0);
  const unapplied = Math.max(0, payment.amount - totalApplied);

  async function downloadPdf() {
    if (!printRef.current) return;
    setDownloading(true);
    try {
      const blob = await generatePdfBlob(printRef.current);
      downloadPdfBlob(blob, `${payment.paymentNumber}.pdf`);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div>
      <style>{`@media print { .no-print { display: none !important; } }`}</style>

      <div className="no-print border-b border-gray-200 bg-white px-6 py-4">
        <Link href="/payments-made" className="mb-2 inline-flex items-center gap-1 text-xs text-gray-400 hover:text-brand-600">
          <ChevronLeft size={12} /> All Payments Made
        </Link>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-ink-800">{payment.paymentNumber}</h1>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                payment.status === "paid" ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"
              }`}
            >
              {payment.status === "paid" ? "Paid" : "Draft"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Link href={`/payments-made/${payment.id}/edit`} className="btn-secondary">
              <Pencil size={14} /> Edit
            </Link>
            <button type="button" onClick={() => window.print()} className="btn-secondary">
              <Printer size={14} /> Print
            </button>
            <button type="button" onClick={downloadPdf} disabled={downloading} className="btn-primary">
              <Download size={14} /> {downloading ? "Preparing..." : "Download PDF"}
            </button>
          </div>
        </div>
      </div>

      <div className="p-6">
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <div ref={printRef} className="bg-white p-8">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-base font-semibold text-ink-800">{org.name}</p>
                {org.addressLines.map((line, i) => (
                  <p key={i} className="text-sm text-gray-500">
                    {line}
                  </p>
                ))}
              </div>
              <div className="text-right">
                <h2 className="text-2xl font-bold tracking-wide text-ink-900">PAYMENT MADE</h2>
                <p className="mt-1 text-sm text-gray-500"># {payment.paymentNumber}</p>
              </div>
            </div>

            <div className="mt-6 flex items-start justify-between">
              <div className="space-y-2 text-sm">
                <div className="flex gap-8">
                  <span className="w-36 text-gray-500">Payment Date</span>
                  <span className="font-medium text-ink-800">{formatDate(payment.paymentDate)}</span>
                </div>
                <div className="flex gap-8">
                  <span className="w-36 text-gray-500">Reference Number</span>
                  <span className="font-medium text-ink-800">{payment.referenceNumber || "-"}</span>
                </div>
                <div className="flex gap-8">
                  <span className="w-36 text-gray-500">Payment Mode</span>
                  <span className="font-medium text-ink-800">{paymentModeLabel(payment.paymentMode)}</span>
                </div>
                <div className="flex gap-8">
                  <span className="w-36 text-gray-500">Paid Through</span>
                  <span className="font-medium text-ink-800">{bankAccountName}</span>
                </div>
              </div>
              <div className="w-48 rounded-lg bg-red-600 px-5 py-4 text-center text-white">
                <p className="text-xs uppercase tracking-wide text-red-100">Amount Paid</p>
                <p className="mt-1 text-xl font-bold">{formatCurrency(payment.amount, currency)}</p>
              </div>
            </div>

            <div className="mt-8 border-t border-gray-100 pt-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Paid To</p>
              <p className="mt-1 text-sm font-medium text-ink-800">{vendorName}</p>
              {vendorAddressLines.map((line, i) => (
                <p key={i} className="text-sm text-gray-500">
                  {line}
                </p>
              ))}
            </div>

            {unapplied > 0.005 && (
              <div className="mt-6 flex items-center justify-between border-t border-gray-100 pt-4">
                <span className="text-sm font-medium text-ink-800">Unapplied Amount</span>
                <span className="text-sm font-semibold text-ink-900">{formatCurrency(unapplied, currency)}</span>
              </div>
            )}

            <div className="mt-6 border-t border-gray-100 pt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Payment For</p>
              {allocations.length === 0 ? (
                <p className="text-sm text-gray-400">This payment isn&apos;t applied to any bill yet.</p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="border-y border-gray-200 bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-3 py-2">Bill Number</th>
                      <th className="px-3 py-2 text-right">Bill Amount</th>
                      <th className="px-3 py-2 text-right">Amount Applied</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {allocations.map((a) => (
                      <tr key={a.billId}>
                        <td className="px-3 py-2 text-ink-700">
                          <Link href={`/bills/${a.billId}`} className="text-brand-600 hover:underline">
                            {a.billNumber}
                          </Link>
                        </td>
                        <td className="px-3 py-2 text-right text-ink-700">{formatCurrency(a.billTotal, currency)}</td>
                        <td className="px-3 py-2 text-right text-ink-800">{formatCurrency(a.amount, currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {payment.notes && (
              <div className="mt-6 border-t border-gray-100 pt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Notes</p>
                <p className="mt-1 whitespace-pre-line text-sm text-gray-600">{payment.notes}</p>
              </div>
            )}
          </div>
        </div>

        <div className="mt-6">
          <JournalPanel title={`Payment - ${payment.paymentNumber}`} lines={journalLines} currency={currency} />
        </div>

        <div className="no-print mt-6 card p-5">
          <h2 className="mb-3 text-sm font-semibold text-ink-800">Attachments</h2>
          <AttachmentsField entityType="payments-made" entityId={payment.id} label="" />
        </div>
      </div>
    </div>
  );
}
