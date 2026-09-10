"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, XCircle } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/format";
import JournalPanel, { type JournalLineData } from "@/components/accounting/JournalPanel";

const STATUS_STYLES: Record<string, string> = {
  open: "bg-blue-50 text-blue-600",
  closed: "bg-emerald-50 text-emerald-600",
  void: "bg-gray-100 text-gray-400",
};

interface LineData {
  description: string;
  quantity: number;
  rate: number;
  amount: number;
}

/** Shared between /credit-notes/[id] and /debit-notes/[id] — the two documents are
 * structurally identical (see credit-debit-notes-api.ts), differing only in label, which
 * direction they move the invoice's balance_due, and which GL journal they post. */
export default function CreditDebitNoteDetailView({
  kind,
  note,
  customerName,
  invoice,
  currency,
  lines,
  journalLines,
}: {
  kind: "credit" | "debit";
  note: {
    id: string;
    number: string;
    date: string;
    status: string;
    subtotal: number;
    taxTotal: number;
    total: number;
    referenceNumber: string | null;
    reason: string | null;
  };
  customerName: string;
  invoice: { id: string; number: string } | null;
  currency: string;
  lines: LineData[];
  journalLines: JournalLineData[];
}) {
  const router = useRouter();
  const label = kind === "credit" ? "Credit Note" : "Debit Note";
  const listHref = kind === "credit" ? "/credit-notes" : "/debit-notes";
  const [voiding, setVoiding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onVoid() {
    if (!confirm(`Void this ${label.toLowerCase()}? This reverses its effect on the invoice's balance due.`)) return;
    setVoiding(true);
    setError(null);
    try {
      const res = await fetch(`/api/${kind === "credit" ? "credit-notes" : "debit-notes"}/${note.id}/void`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed to void this ${label.toLowerCase()}.`);
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : `Failed to void this ${label.toLowerCase()}.`);
    } finally {
      setVoiding(false);
    }
  }

  return (
    <div>
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <Link href={listHref} className="mb-2 inline-flex items-center gap-1 text-xs text-gray-400 hover:text-brand-600">
          <ChevronLeft size={12} /> All {label}s
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-semibold text-ink-800">{note.number}</h1>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[note.status] ?? "bg-gray-100 text-gray-600"}`}>
                {note.status}
              </span>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              {customerName}
              {invoice && (
                <>
                  {" "}
                  &middot; Against invoice{" "}
                  <Link href={`/invoices/${invoice.id}`} className="font-medium text-brand-600 hover:underline">
                    {invoice.number}
                  </Link>
                </>
              )}
            </p>
          </div>
          {note.status !== "void" && (
            <button type="button" onClick={onVoid} disabled={voiding} className="btn-secondary">
              <XCircle size={14} /> {voiding ? "Voiding..." : "Void"}
            </button>
          )}
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>

      <div className="p-6">
        <JournalPanel title={`${label} - ${note.number}`} lines={journalLines} currency={currency} defaultOpen />

        <div className="rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Customer</p>
              <p className="mt-1 text-sm font-medium text-ink-800">{customerName}</p>
            </div>
            <div className="text-right">
              <h2 className="text-2xl font-bold tracking-wide text-ink-900">{label.toUpperCase()}</h2>
              <p className="mt-1 text-sm text-gray-500"># {note.number}</p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-4 border-t border-gray-100 pt-4 text-sm">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Date</p>
              <p className="text-ink-700">{formatDate(note.date)}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Reference #</p>
              <p className="text-ink-700">{note.referenceNumber || "-"}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Invoice</p>
              <p className="text-ink-700">
                {invoice ? (
                  <Link href={`/invoices/${invoice.id}`} className="text-brand-600 hover:underline">
                    {invoice.number}
                  </Link>
                ) : (
                  "-"
                )}
              </p>
            </div>
          </div>

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
                <span>{formatCurrency(note.subtotal, currency)}</span>
              </div>
              {note.taxTotal > 0 && (
                <div className="flex items-center justify-between text-ink-700">
                  <span>Tax</span>
                  <span>{formatCurrency(note.taxTotal, currency)}</span>
                </div>
              )}
              <div className="flex items-center justify-between border-t border-gray-100 pt-1.5 font-semibold text-ink-900">
                <span>Total</span>
                <span>{formatCurrency(note.total, currency)}</span>
              </div>
            </div>
          </div>

          {note.reason && (
            <div className="mt-6 border-t border-gray-100 pt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Reason</p>
              <p className="mt-1 whitespace-pre-line text-sm text-gray-600">{note.reason}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
