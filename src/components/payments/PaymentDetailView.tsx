"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronDown, ChevronRight, Pencil, Download, Printer, Mail, Undo2 } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { generatePdfBlob, downloadPdfBlob } from "@/lib/pdf-export";
import JournalPanel, { type JournalLineData } from "@/components/accounting/JournalPanel";
import AttachmentsField from "@/components/attachments/AttachmentsField";
import EmailsList from "@/components/emails/EmailsList";
import SendEmailModal from "@/components/emails/SendEmailModal";

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

interface RefundData {
  id: string;
  amount: number;
  refundedOn: string;
  paymentMode: string;
  referenceNumber: string | null;
  description: string | null;
  fromAccountName: string | null;
  journalLines: JournalLineData[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function paymentModeLabel(mode: string) {
  return mode
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default function PaymentDetailView({
  payment,
  customerName,
  customerEmail,
  customerAddressLines,
  bankAccountName,
  org,
  allocations,
  journalLines,
  currency,
  project,
  unit,
  refunds = [],
  previouslyRefunded = 0,
}: {
  payment: PaymentData;
  customerName: string;
  customerEmail: string | null;
  customerAddressLines: string[];
  bankAccountName: string;
  org: { name: string; addressLines: string[]; logoDataUri?: string | null };
  allocations: AllocationData[];
  journalLines: JournalLineData[];
  currency: string;
  /** Optional Property Master tags — see payments_received.project_id/unit_id. */
  project?: { id: string; name: string } | null;
  unit?: { id: string; name: string } | null;
  /** Refund history — see payment_refunds (migration 1771000000000_payment_refunds.js) and
   * the "Refund" button below. */
  refunds?: RefundData[];
  previouslyRefunded?: number;
}) {
  const printRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailRefreshSignal, setEmailRefreshSignal] = useState(0);
  const [refundHistoryOpen, setRefundHistoryOpen] = useState(false);

  const totalApplied = allocations.reduce((sum, a) => sum + a.amount, 0);
  // "Over Payment" is what's STILL unrefunded excess — the original unapplied amount minus
  // whatever's already been refunded — not the full original excess (which is what "Payment
  // Refund" below plus this add back up to). Matches the Zoho reference screenshot: an
  // AED1,000 receipt with AED900 applied and AED69 already refunded shows "Payment Refund:
  // 69.00" / "Over Payment: 31.00", not "Over Payment: 100.00".
  const overpayment = Math.max(0, round2(payment.amount - totalApplied - previouslyRefunded));
  const canRefund = payment.status === "paid" && overpayment > 0.005;

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
            <button type="button" onClick={() => setEmailModalOpen(true)} className="btn-secondary">
              <Mail size={14} /> Send Email
            </button>
            {canRefund && (
              <Link href={`/payments-received/${payment.id}/refund`} className="btn-secondary">
                <Undo2 size={14} /> Refund
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="p-6">
        {refunds.length > 0 && (
          <div className="no-print mb-6 card overflow-hidden">
            <button
              type="button"
              onClick={() => setRefundHistoryOpen((v) => !v)}
              className="flex w-full items-center justify-between px-4 py-3 text-left"
            >
              <span className="text-sm font-medium text-ink-800">
                Refund History <span className="ml-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">{refunds.length}</span>
              </span>
              {refundHistoryOpen ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
            </button>
            {refundHistoryOpen && (
              <div className="border-t border-gray-100">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-4 py-2">Refunded On</th>
                      <th className="px-4 py-2 text-right">Amount</th>
                      <th className="px-4 py-2">Payment Mode</th>
                      <th className="px-4 py-2">From Account</th>
                      <th className="px-4 py-2">Reference#</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {refunds.map((r) => (
                      <tr key={r.id}>
                        <td className="px-4 py-2 text-ink-700">{formatDate(r.refundedOn)}</td>
                        <td className="px-4 py-2 text-right text-ink-800">{formatCurrency(r.amount, currency)}</td>
                        <td className="px-4 py-2 text-ink-700">{paymentModeLabel(r.paymentMode)}</td>
                        <td className="px-4 py-2 text-ink-700">{r.fromAccountName ?? "-"}</td>
                        <td className="px-4 py-2 text-ink-700">{r.referenceNumber || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <div ref={printRef} className="bg-white p-8">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                {org.logoDataUri && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={org.logoDataUri} alt="" className="h-12 w-12 shrink-0 rounded object-contain" />
                )}
                <div>
                  <p className="text-base font-semibold text-ink-800">{org.name}</p>
                  {org.addressLines.map((line, i) => (
                    <p key={i} className="text-sm text-gray-500">
                      {line}
                    </p>
                  ))}
                </div>
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

            {(project || unit) && (
              <div className="mt-6 flex flex-wrap gap-6 border-t border-gray-100 pt-4 text-sm">
                {project && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Project</p>
                    <Link href={`/projects/${project.id}`} className="text-brand-600 hover:underline">
                      {project.name}
                    </Link>
                  </div>
                )}
                {unit && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Unit</p>
                    <Link href={`/inventory/${unit.id}`} className="text-brand-600 hover:underline">
                      {unit.name}
                    </Link>
                  </div>
                )}
              </div>
            )}

            {(previouslyRefunded > 0.005 || overpayment > 0.005) && (
              <div className="mt-6 flex flex-wrap gap-8 border-t border-gray-100 pt-4">
                {previouslyRefunded > 0.005 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Payment Refund</p>
                    <p className="text-sm font-semibold text-ink-900">{formatCurrency(previouslyRefunded, currency)}</p>
                  </div>
                )}
                {overpayment > 0.005 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Over Payment</p>
                    <p className="text-sm font-semibold text-ink-900">{formatCurrency(overpayment, currency)}</p>
                  </div>
                )}
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
          {refunds.map((r) => (
            <JournalPanel
              key={r.id}
              title={`Refund - ${formatDate(r.refundedOn)} - ${formatCurrency(r.amount, currency)}`}
              lines={r.journalLines}
              currency={currency}
            />
          ))}
        </div>

        <div className="no-print mt-6 card p-5">
          <h2 className="mb-3 text-sm font-semibold text-ink-800">Attachments</h2>
          <AttachmentsField entityType="payments-received" entityId={payment.id} label="" />
        </div>

        <div className="no-print mt-6 card p-5">
          <h2 className="mb-3 text-sm font-semibold text-ink-800">Emails</h2>
          <EmailsList entityType="payments-received" entityId={payment.id} refreshSignal={emailRefreshSignal} />
        </div>
      </div>

      <SendEmailModal
        open={emailModalOpen}
        onClose={() => setEmailModalOpen(false)}
        entityType="payments-received"
        entityId={payment.id}
        docNumber={payment.paymentNumber}
        orgName={org.name}
        partyName={customerName}
        defaultToEmail={customerEmail}
        printRef={printRef}
        onSent={() => setEmailRefreshSignal((n) => n + 1)}
      />
    </div>
  );
}
