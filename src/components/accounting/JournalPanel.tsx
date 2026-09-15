"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import { formatCurrency } from "@/lib/format";

export interface JournalLineData {
  accountName: string;
  debit: number;
  credit: number;
  /** When set, the account name links to its own detail page (/chart-of-accounts/[id]),
   * which shows every journal line and expense posted against it — added for the Expense
   * detail page so clicking the expense account navigates straight to its ledger. Optional
   * and omitted by every other caller (invoices/payments/credit-debit notes), which keep
   * rendering plain text exactly as before. */
  accountId?: string | null;
}

/** Read-only double-entry view of the journal auto-generated for one invoice or payment (see
 * src/lib/auto-journal.ts) — mirrors the "Journal" tab Zoho Books shows on a transaction.
 * Collapsed by default, matching the "Payments Received" panel already on the invoice detail
 * page. Renders nothing (not even the header) when there are no lines and the document was
 * never expected to have one — e.g. a Draft invoice — so the page doesn't imply a posted entry
 * that doesn't exist.
 *
 * Real bug found and fixed 2026-09-15: auto-journal.ts's account resolution deliberately never
 * throws — if the org's Chart of Accounts is missing a required account (Accounts Receivable,
 * an Income account, VAT Payable, a bank's own GL account, ...), the journal sync quietly posts
 * nothing rather than failing the document save. That's the right call for the save itself, but
 * this panel used to render nothing in that case too — visually IDENTICAL to a legitimate Draft
 * document that has no journal yet, with no way to tell "hasn't posted yet" apart from "silently
 * failed to post." A user reported invoices/receipts not generating journal entries and it
 * turned out to be exactly this: an already-Sent/Paid document whose journal never posted, with
 * nothing on the page saying so. `expectPosted` — true whenever the caller's own status logic
 * says this document should have posted a journal by now — makes that failure visible instead. */
export default function JournalPanel({
  title,
  lines,
  currency,
  defaultOpen = false,
  expectPosted = false,
}: {
  title: string;
  lines: JournalLineData[];
  currency: string;
  defaultOpen?: boolean;
  expectPosted?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (lines.length === 0) {
    if (!expectPosted) return null;
    const label = title.split(" - ")[0]?.toLowerCase() || "document";
    return (
      <div className="no-print card mb-6 border border-amber-200 bg-amber-50">
        <div className="px-4 py-3 text-sm text-amber-800">
          <span className="font-medium">No journal entry was posted for this {label}.</span> This usually means
          your Chart of Accounts is missing an account this transaction needs — an Accounts Receivable/Payable
          account, an Income account, a tax account, or the bank account&apos;s own GL account. Check Chart of
          Accounts for a missing or inactive entry, then re-save this {label} to try posting it again.
        </div>
      </div>
    );
  }

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
                  <td className="py-1.5 text-ink-700">
                    {line.accountId ? (
                      <Link href={`/chart-of-accounts/${line.accountId}`} className="text-brand-600 hover:underline">
                        {line.accountName}
                      </Link>
                    ) : (
                      line.accountName
                    )}
                  </td>
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
