"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Pencil, Download, Printer } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/format";
import JournalPanel, { type JournalLineData } from "@/components/accounting/JournalPanel";
import AttachmentsField from "@/components/attachments/AttachmentsField";

interface PaymentData {
  id: string;
  paymentNumber: string;
  paymentDate: string;
  amount: number;
  bankCharges: number;
  paymentMode: string;
  referenceNumber: string | null;
  status: string;
  notes: string | null;
}

interface AllocationData {
  invoiceId: string;
  invoiceNumber: string;
  invoiceTotal: number;
  amount: number;
}

function paymentModeLabel(mode: string) {
  return mode
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default function PaymentDetailView({
  payment,
  customerName,
  customerAddressLines,
  bankAccountName,
  org,
  allocations,
  journalLines,
  currency,
}: {
  payment: PaymentData;
  customerName: string;
  customerAddressLines: string[];
  bankAccountName: string;
  org: { name: string; addressLines: string[] };
  allocations: AllocationData[];
  journalLines: JournalLineData[];
  currency: string;
}) {
  const printRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  const totalApplied = allocations.reduce((sum, a) => sum + a.amount, 0);
  const overpayment = Math.max(0, payment.amount - totalApplied);

  async function downloadPdf() {
    if (!printRef.current) return;
    setDownloading(true);
    try {
      // See InvoiceDetailView.tsx for why this imports the dist path directly rather than
      // the bare "jspdf"/"html2canvas" specifiers.
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf/dist/jspdf.es.min.js"),
      ]);
      const canvas = await html2canvas(printRef.current, { scale: 2, backgroundColor: "#ffffff" });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ unit: "pt", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;
      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
      while (heightLeft > 0) {
        position -= pageHeight;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }
      pdf.save(`${payment.paymentNumber}.pdf`);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div>
      <style>{`@media print { .no-print { display: none !important; } }`}</style>

      <div className="no-print border-b border-gray-200 bg-white px-6 py-4">
        <Link href="/payments-received" className="mb-2 inline-flex items-center gap-1 text-xs text-gray-400 hover:text-brand-600">
          <ChevronLeft size={12} /> All Payments Received
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
            <Link href={`/payments-received/${payment.id}/edit`} className="btn-secondary">
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
                <h2 className="text-2xl font-bold tracking-wide text-ink-900">PAYMENT RECEIPT</h2>
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
                  <span className="w-36 text-gray-500">Deposited To</span>
                  <span className="font-medium text-ink-800">{bankAccountName}</span>
                </div>
                {payment.bankCharges > 0 && (
                  <div className="flex gap-8">
                    <span className="w-36 text-gray-500">Bank Charges</span>
                    <span className="font-medium text-ink-800">{formatCurrency(payment.bankCharges, currency)}</span>
                  </div>
                )}
              </div>
              <div className="w-48 rounded-lg bg-emerald-600 px-5 py-4 text-center text-white">
                <p className="text-xs uppercase tracking-wide text-emerald-100">Amount Received</p>
                <p className="mt-1 text-xl font-bold">{formatCurrency(payment.amount, currency)}</p>
              </div>
            </div>

            <div className="mt-8 border-t border-gray-100 pt-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Received From</p>
              <p className="mt-1 text-sm font-medium text-ink-800">{customerName}</p>
              {customerAddressLines.map((line, i) => (
                <p key={i} className="text-sm text-gray-500">
                  {line}
                </p>
              ))}
            </div>

            {overpayment > 0.005 && (
              <div className="mt-6 flex items-center justify-between border-t border-gray-100 pt-4">
                <span className="text-sm font-medium text-ink-800">Over Payment</span>
                <span className="text-sm font-semibold text-ink-900">{formatCurrency(overpayment, currency)}</span>
              </div>
            )}

            <div className="mt-6 border-t border-gray-100 pt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Payment For</p>
              {allocations.length === 0 ? (
                <p className="text-sm text-gray-400">This payment isn&apos;t applied to any invoice yet.</p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="border-y border-gray-200 bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-3 py-2">Invoice Number</th>
                      <th className="px-3 py-2 text-right">Invoice Amount</th>
                      <th className="px-3 py-2 text-right">Amount Applied</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {allocations.map((a) => (
                      <tr key={a.invoiceId}>
                        <td className="px-3 py-2 text-ink-700">
                          <Link href={`/invoices/${a.invoiceId}`} className="text-brand-600 hover:underline">
                            {a.invoiceNumber}
                          </Link>
                        </td>
                        <td className="px-3 py-2 text-right text-ink-700">{formatCurrency(a.invoiceTotal, currency)}</td>
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
          <AttachmentsField entityType="payments-received" entityId={payment.id} label="" />
        </div>
      </div>
    </div>
  );
}
