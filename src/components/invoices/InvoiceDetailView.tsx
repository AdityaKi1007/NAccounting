"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  Pencil,
  Download,
  Printer,
  ChevronRight,
  ChevronDown,
  MoreVertical,
  XCircle,
  FileMinus,
  FilePlus,
  Mail,
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { generatePdfBlob, downloadPdfBlob } from "@/lib/pdf-export";
import JournalPanel, { type JournalLineData } from "@/components/accounting/JournalPanel";
import EmailsList from "@/components/emails/EmailsList";
import SendEmailModal from "@/components/emails/SendEmailModal";

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  sent: "bg-blue-50 text-blue-600",
  paid: "bg-emerald-50 text-emerald-600",
  partially_paid: "bg-amber-50 text-amber-700",
  overdue: "bg-red-50 text-red-600",
  void: "bg-gray-100 text-gray-400",
};

interface InvoiceData {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string | null;
  status: string;
  subtotal: number;
  taxTotal: number;
  total: number;
  balanceDue: number;
  notes: string | null;
  /** External CRM system's own reference number for this invoice
   * (migrations/1776000000000_crm_reference_numbers.js). */
  crmInvNo: string | null;
}

interface CustomerData {
  displayName: string;
  companyName: string | null;
  billingAddress: string | null;
  email: string | null;
}

interface LineData {
  description: string;
  quantity: number;
  rate: number;
  amount: number;
}

interface PaymentData {
  paymentNumber: string;
  paymentDate: string;
  amount: number;
}

// Best-effort label from real dates rather than a stored terms field — this app doesn't
// keep a "payment terms" value on the invoice itself, only invoice_date and due_date.
function termsLabel(invoiceDate: string, dueDate: string | null) {
  if (!dueDate) return "-";
  const days = Math.round((new Date(dueDate).getTime() - new Date(invoiceDate).getTime()) / 86400000);
  if (days <= 0) return "Due on Receipt";
  return `Net ${days}`;
}

export default function InvoiceDetailView({
  invoice,
  customer,
  org,
  currency,
  lines,
  payments,
  journalLines,
  salesOrder,
  project,
  unit,
}: {
  invoice: InvoiceData;
  customer: CustomerData | null;
  org: { name: string; addressLines: string[]; logoDataUri?: string | null };
  currency: string;
  lines: LineData[];
  payments: PaymentData[];
  journalLines: JournalLineData[];
  /** Set when this invoice was created via a Sales Order's "Convert to Invoice" action —
   * see invoices.sales_order_id in entities.ts and convert-to-invoice/route.ts. */
  salesOrder?: { id: string; soNumber: string } | null;
  /** Optional Property Master tags — see invoices.project_id/unit_id in entities.ts. */
  project?: { id: string; name: string } | null;
  unit?: { id: string; name: string } | null;
}) {
  const router = useRouter();
  const printRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [paymentsOpen, setPaymentsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailRefreshSignal, setEmailRefreshSignal] = useState(0);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  // A Draft invoice has never posted a GL journal (syncInvoiceJournal skips draft/void
  // entirely), so cancelling one is a pure status flip — nothing to reverse.
  async function cancelDraft() {
    setMenuOpen(false);
    setUpdating(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/documents/invoices/${invoice.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ header: { status: "void" } }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to cancel this invoice.");
      }
      router.refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to cancel this invoice.");
    } finally {
      setUpdating(false);
    }
  }

  async function downloadPdf() {
    if (!printRef.current) return;
    setDownloading(true);
    try {
      const blob = await generatePdfBlob(printRef.current);
      downloadPdfBlob(blob, `${invoice.invoiceNumber}.pdf`);
    } finally {
      setDownloading(false);
    }
  }

  const billToName = customer?.companyName ? `${customer.displayName} (${customer.companyName})` : customer?.displayName ?? "-";

  return (
    <div>
      <style>{`@media print { .no-print { display: none !important; } }`}</style>

      <div className="no-print border-b border-gray-200 bg-white px-6 py-4">
        <Link href="/invoices" className="mb-2 inline-flex items-center gap-1 text-xs text-gray-400 hover:text-brand-600">
          <ChevronLeft size={12} /> All Invoices
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-semibold text-ink-800">{invoice.invoiceNumber}</h1>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[invoice.status] ?? "bg-gray-100 text-gray-600"}`}>
                {invoice.status.replace("_", " ")}
              </span>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              {billToName} &middot; Balance Due: <span className="font-medium text-ink-700">{formatCurrency(invoice.balanceDue, currency)}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href={`/invoices/${invoice.id}/edit`} className="btn-secondary">
              <Pencil size={14} /> Edit
            </Link>
            <button type="button" onClick={() => window.print()} className="btn-secondary">
              <Printer size={14} /> Print
            </button>
            <button type="button" onClick={downloadPdf} disabled={downloading} className="btn-primary">
              <Download size={14} /> {downloading ? "Preparing..." : "Download PDF"}
            </button>
            {invoice.status === "draft" && (
              <button type="button" onClick={cancelDraft} disabled={updating} className="btn-secondary">
                <XCircle size={14} /> Cancel
              </button>
            )}
            <div className="relative" ref={menuRef}>
              <button type="button" onClick={() => setMenuOpen((v) => !v)} className="btn-secondary px-2" aria-label="More actions">
                <MoreVertical size={16} />
              </button>
              {menuOpen && (
                <div className="absolute right-0 z-10 mt-1 w-56 rounded-md border border-gray-200 bg-white py-1 shadow-lg">
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      setEmailModalOpen(true);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink-700 hover:bg-gray-50"
                  >
                    <Mail size={14} /> Send Email
                  </button>
                  <div className="my-1 border-t border-gray-100" />
                  {invoice.status === "draft" || invoice.status === "void" ? (
                    <p className="px-3 py-2 text-xs text-gray-400">
                      Credit/Debit notes can only be created against an invoice that has been sent.
                    </p>
                  ) : (
                    <>
                      <Link
                        href={`/invoices/${invoice.id}/credit-note/new`}
                        className="flex items-center gap-2 px-3 py-2 text-sm text-ink-700 hover:bg-gray-50"
                        onClick={() => setMenuOpen(false)}
                      >
                        <FileMinus size={14} /> Create Credit Note
                      </Link>
                      <Link
                        href={`/invoices/${invoice.id}/debit-note/new`}
                        className="flex items-center gap-2 px-3 py-2 text-sm text-ink-700 hover:bg-gray-50"
                        onClick={() => setMenuOpen(false)}
                      >
                        <FilePlus size={14} /> Create Debit Note
                      </Link>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        {actionError && <p className="mt-2 text-sm text-red-600">{actionError}</p>}
      </div>

      <div className="p-6">
        <div className="no-print card mb-6">
          <button
            type="button"
            onClick={() => setPaymentsOpen((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-3 text-left"
          >
            <span className="flex items-center gap-2 text-sm font-medium text-ink-800">
              Payments Received
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">{payments.length}</span>
            </span>
            {paymentsOpen ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
          </button>
          {paymentsOpen && (
            <div className="border-t border-gray-100 px-4 py-3">
              {payments.length === 0 ? (
                <p className="text-sm text-gray-400">No payments recorded against this invoice yet.</p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                    <tr>
                      <th className="py-1">Date</th>
                      <th className="py-1">Payment #</th>
                      <th className="py-1 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {payments.map((p, i) => (
                      <tr key={i}>
                        <td className="py-1.5 text-ink-700">{formatDate(p.paymentDate)}</td>
                        <td className="py-1.5 text-ink-700">{p.paymentNumber}</td>
                        <td className="py-1.5 text-right text-ink-800">{formatCurrency(p.amount, currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>

        <JournalPanel title={`Invoice - ${invoice.invoiceNumber}`} lines={journalLines} currency={currency} />

        <div className="relative overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          {invoice.status === "paid" && (
            <span className="absolute left-0 top-0 -translate-x-[30%] -translate-y-[10%] -rotate-45 bg-emerald-500 px-8 py-1 text-xs font-semibold uppercase tracking-wide text-white">
              Paid
            </span>
          )}
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
                <h2 className="text-2xl font-bold tracking-wide text-ink-900">TAX INVOICE</h2>
                <p className="mt-1 text-sm text-gray-500"># {invoice.invoiceNumber}</p>
              </div>
            </div>

            <div className="mt-6 flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Bill To</p>
                <p className="mt-1 text-sm font-medium text-ink-800">{billToName}</p>
                {customer?.billingAddress
                  ?.split("\n")
                  .filter(Boolean)
                  .map((line, i) => (
                    <p key={i} className="text-sm text-gray-500">
                      {line}
                    </p>
                  ))}
              </div>
              <div className="text-right text-sm">
                <p className="font-semibold text-ink-800">Balance Due</p>
                <p className="text-xl font-bold text-ink-900">{formatCurrency(invoice.balanceDue, currency)}</p>
              </div>
            </div>

            <div className={`mt-6 grid gap-4 border-t border-gray-100 pt-4 text-sm ${salesOrder ? "grid-cols-4" : "grid-cols-3"}`}>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Invoice Date</p>
                <p className="text-ink-700">{formatDate(invoice.invoiceDate)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Terms</p>
                <p className="text-ink-700">{termsLabel(invoice.invoiceDate, invoice.dueDate)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Due Date</p>
                <p className="text-ink-700">{invoice.dueDate ? formatDate(invoice.dueDate) : "-"}</p>
              </div>
              {salesOrder && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Order Number</p>
                  <Link href={`/sales-orders/${salesOrder.id}`} className="text-brand-600 hover:underline">
                    {salesOrder.soNumber}
                  </Link>
                </div>
              )}
            </div>

            {(project || unit) && (
              <div className="mt-4 flex flex-wrap gap-6 border-t border-gray-100 pt-4 text-sm">
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

            {invoice.crmInvNo && (
              <div className="mt-4 flex flex-wrap gap-6 border-t border-gray-100 pt-4 text-sm">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">CRM Inv No</p>
                  <p className="text-ink-700">{invoice.crmInvNo}</p>
                </div>
              </div>
            )}

            <table className="mt-6 w-full text-left text-sm">
              <thead className="border-y border-gray-200 bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Item &amp; Description</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2 text-right">Rate</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lines.map((line, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2 text-ink-700">{i + 1}</td>
                    <td className="px-3 py-2 text-ink-700">{line.description}</td>
                    <td className="px-3 py-2 text-right text-ink-700">{line.quantity}</td>
                    <td className="px-3 py-2 text-right text-ink-700">{formatCurrency(line.rate, currency)}</td>
                    <td className="px-3 py-2 text-right text-ink-800">{formatCurrency(line.amount, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-4 flex justify-end">
              <div className="w-64 space-y-1.5 text-sm">
                <div className="flex items-center justify-between text-ink-700">
                  <span>Sub Total</span>
                  <span>{formatCurrency(invoice.subtotal, currency)}</span>
                </div>
                {invoice.taxTotal > 0 && (
                  <div className="flex items-center justify-between text-ink-700">
                    <span>Tax</span>
                    <span>{formatCurrency(invoice.taxTotal, currency)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between border-t border-gray-100 pt-1.5 font-medium text-ink-800">
                  <span>Total</span>
                  <span>{formatCurrency(invoice.total, currency)}</span>
                </div>
                <div className="flex items-center justify-between font-semibold text-ink-900">
                  <span>Balance Due</span>
                  <span>{formatCurrency(invoice.balanceDue, currency)}</span>
                </div>
              </div>
            </div>

            {invoice.notes && (
              <div className="mt-6 border-t border-gray-100 pt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Notes</p>
                <p className="mt-1 whitespace-pre-line text-sm text-gray-600">{invoice.notes}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="no-print px-6 pb-6">
        <div className="card p-5">
          <h2 className="mb-3 text-sm font-semibold text-ink-800">Emails</h2>
          <EmailsList entityType="invoices" entityId={invoice.id} refreshSignal={emailRefreshSignal} />
        </div>
      </div>

      <SendEmailModal
        open={emailModalOpen}
        onClose={() => setEmailModalOpen(false)}
        entityType="invoices"
        entityId={invoice.id}
        docNumber={invoice.invoiceNumber}
        orgName={org.name}
        partyName={billToName}
        defaultToEmail={customer?.email ?? null}
        printRef={printRef}
        onSent={() => setEmailRefreshSignal((n) => n + 1)}
      />
    </div>
  );
}
