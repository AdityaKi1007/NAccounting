"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { formatCurrency } from "@/lib/format";

export interface JournalLineData {
  accountName: string;
  debit: number;
  credit: number;
}

/** Read-only double-entry view of the journal auto-generated for one invoice or payment (see
 * src/lib/auto-journal.ts) — mirrors the "Journal" tab Zoho Books shows on a transaction.
 * Collapsed by default, matching the "Payments Received" panel already on the invoice detail
 * page. Renders nothing (not even the header) when there are no lines yet — e.g. a Draft
 * invoice, or a Paid payment whose Chart of Accounts is missing a required account — so the
 * page doesn't imply a posted entry that doesn't exist. */
export default function JournalPanel({
  title,
  lines,
  currency,
  defaultOpen = false,
}: {
  title: string;
  lines: JournalLineData[];
  currency: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (lines.length === 0) return null;

  const totalDebit = lines.reduce((sum, l) => sum + l.debit, 0);
  const totalCredit = lines.reduce((sum, l) => sum + l.credit, 0);

  return (
    <div className="no-print card mb-6">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-sm font-medium text-ink-800">Journal</span>
        {open ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
      </button>
      {open && (
        <div className="border-t border-gray-100 px-4 py-4">
          <div className="mb-3 flex items-center gap-2 text-xs text-gray-400">
            <span>Amount is displayed in your base currency</span>
            <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">{currency}</span>
          </div>
          <p className="mb-2 text-sm font-semibold text-ink-800">{title}</p>
          <table className="w-full text-left text-sm">
            <thead className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              <tr>
                <th className="py-1">Account</th>
                <th className="py-1 text-right">Debit</th>
                <th className="py-1 text-right">Credit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {lines.map((line, i) => (
                <tr key={i}>
                  <td className="py-1.5 text-ink-700">{line.accountName}</td>
                  <td className="py-1.5 text-right text-ink-700">{line.debit > 0 ? formatCurrency(line.debit, currency) : "0.00"}</td>
                  <td className="py-1.5 text-right text-ink-700">{line.credit > 0 ? formatCurrency(line.credit, currency) : "0.00"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-200 font-semibold text-ink-900">
                <td className="py-1.5">&nbsp;</td>
                <td className="py-1.5 text-right">{formatCurrency(totalDebit, currency)}</td>
                <td className="py-1.5 text-right">{formatCurrency(totalCredit, currency)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
