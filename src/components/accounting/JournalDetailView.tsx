"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import { REPORTING_METHODS } from "@/components/crud/JournalForm";

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  published: "bg-emerald-50 text-emerald-600",
};

interface LineData {
  accountName: string;
  description: string | null;
  contactName: string | null;
  debit: number;
  credit: number;
}

interface LinkedJournal {
  id: string;
  journal_number: string;
  journal_date: string;
  status: string;
}

type Tab = "overview" | "reverse" | "activity";

/** Read-only detail view for a single Manual Journal, opened by clicking its Journal # from
 * the list (see entities.ts's manual-journals hasDetailView flag). Matches Zoho's own layout:
 * an Overview tab with the journal's header fields and its debit/credit lines, an Associated
 * Reverse Journal tab (this app's own Reverse Journal Date feature — see
 * src/lib/journal-reversals.ts), and an Activity Logs tab. */
export default function JournalDetailView({
  journal,
  currency,
  lines,
  reversalOf,
  reversalFor,
}: {
  journal: {
    id: string;
    number: string;
    date: string;
    referenceNumber: string | null;
    notes: string | null;
    status: string;
    createdAt: string;
    reportingMethod: string;
    reverseJournalDate: string | null;
    reverseOnlyOnDate: boolean;
    /** True when this journal IS a reversal (reversed_journal_id is set on it) rather than
     * an original that may or may not have one. */
    isReversal: boolean;
  };
  currency: string;
  lines: LineData[];
  /** Set only when journal.isReversal — the original journal this one reverses. */
  reversalOf: LinkedJournal | null;
  /** Set when this (original) journal has its own reversing journal. */
  reversalFor: LinkedJournal | null;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("overview");
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const totalDebit = lines.reduce((sum, l) => sum + l.debit, 0);
  const totalCredit = lines.reduce((sum, l) => sum + l.credit, 0);
  const reportingLabel = REPORTING_METHODS.find((m) => m.value === journal.reportingMethod)?.label ?? journal.reportingMethod;
  const transactionType = journal.isReversal ? "Journal Reversal" : "Journal";
  const linkedJournal = journal.isReversal ? reversalOf : reversalFor;

  async function onDelete() {
    if (!confirm(`Delete Journal ${journal.number}? This can't be undone.`)) return;
    setDeleting(true);
    try {
      await fetch(`/api/journals/${journal.id}`, { method: "DELETE" });
      router.push("/manual-journals");
      router.refresh();
    } finally {
      setDeleting(false);
      setMenuOpen(false);
    }
  }

  return (
    <div>
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <Link href="/manual-journals" className="mb-2 inline-flex items-center gap-1 text-xs text-gray-400 hover:text-brand-600">
          <ChevronLeft size={12} /> All Manual Journals
        </Link>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold text-ink-800">{journal.number}</h1>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[journal.status] ?? "bg-gray-100 text-gray-600"}`}>
              {journal.status}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Link href={`/manual-journals/${journal.id}/edit`} className="btn-secondary">
              <Pencil size={14} /> Edit
            </Link>
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className="rounded-md border border-gray-200 p-2 text-gray-500 hover:bg-gray-50"
                title="More actions"
              >
                <MoreVertical size={16} />
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 z-20 mt-1 w-40 rounded-md border border-gray-200 bg-white py-1 shadow-lg">
                    <button
                      type="button"
                      onClick={onDelete}
                      disabled={deleting}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                    >
                      <Trash2 size={14} /> {deleting ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="border-b border-gray-200 bg-white px-6">
        <nav className="flex gap-6 text-sm">
          {(
            [
              ["overview", "Overview"],
              ["reverse", "Associated Reverse Journal"],
              ["activity", "Activity Logs"],
            ] as [Tab, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`border-b-2 py-3 font-medium ${
                tab === key ? "border-brand-600 text-brand-600" : "border-transparent text-gray-500 hover:text-ink-700"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      <div className="p-6">
        {tab === "overview" && (
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Journal Date</p>
                <p className="mt-1 text-ink-700">{formatDate(journal.date)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Reference Number</p>
                <p className="mt-1 text-ink-700">{journal.referenceNumber || "-"}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Currency</p>
                <p className="mt-1 text-ink-700">{currency}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Transaction Type</p>
                <p className="mt-1 text-ink-700">{transactionType}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Notes</p>
                <p className="mt-1 whitespace-pre-line text-ink-700">{journal.notes || "-"}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Reporting Method</p>
                <p className="mt-1 text-ink-700">{reportingLabel}</p>
              </div>
            </div>

            <h2 className="mt-8 mb-3 text-base font-semibold text-ink-800">Journal Details</h2>
            <table className="w-full text-left text-sm">
              <thead className="border-y border-gray-200 bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2">Account</th>
                  <th className="px-3 py-2">Contact</th>
                  <th className="px-3 py-2 text-right">Debit</th>
                  <th className="px-3 py-2 text-right">Credit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lines.map((line, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2 text-ink-700">
                      {line.accountName}
                      {line.description && <span className="block text-xs text-gray-400">{line.description}</span>}
                    </td>
                    <td className="px-3 py-2 text-ink-700">{line.contactName || "-"}</td>
                    <td className="px-3 py-2 text-right text-ink-700">{line.debit > 0 ? formatCurrency(line.debit, currency) : "-"}</td>
                    <td className="px-3 py-2 text-right text-ink-700">{line.credit > 0 ? formatCurrency(line.credit, currency) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-4 flex justify-end">
              <div className="w-72 space-y-1.5 text-sm">
                <div className="flex items-center justify-between text-ink-700">
                  <span>Sub Total</span>
                  <div className="flex gap-8">
                    <span>{formatCurrency(totalDebit, currency)}</span>
                    <span>{formatCurrency(totalCredit, currency)}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between border-t border-gray-100 pt-1.5 font-semibold text-ink-900">
                  <span>Total Amount</span>
                  <div className="flex gap-8">
                    <span>{formatCurrency(totalDebit, currency)}</span>
                    <span>{formatCurrency(totalCredit, currency)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === "reverse" && (
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            {linkedJournal ? (
              <div>
                <p className="mb-3 text-sm text-gray-500">
                  {journal.isReversal
                    ? "This journal is the automatically-generated reversal of:"
                    : "This journal's reversal, generated automatically on its Reverse Journal Date:"}
                </p>
                <Link
                  href={`/manual-journals/${linkedJournal.id}`}
                  className="flex items-center justify-between rounded-md border border-gray-200 p-4 hover:bg-gray-50"
                >
                  <div>
                    <p className="font-medium text-brand-600">{linkedJournal.journal_number}</p>
                    <p className="text-sm text-gray-500">{formatDate(linkedJournal.journal_date)}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[linkedJournal.status] ?? "bg-gray-100 text-gray-600"}`}>
                    {linkedJournal.status}
                  </span>
                </Link>
              </div>
            ) : journal.isReversal ? (
              <p className="text-sm text-gray-400">The journal this reverses could not be found (it may have been deleted).</p>
            ) : journal.reverseJournalDate ? (
              <p className="text-sm text-gray-400">
                A Reverse Journal Date is set ({formatDate(journal.reverseJournalDate)}) but no reversal has been generated yet — this
                happens once the journal is Published{journal.status !== "published" ? " (publish it to generate the reversal)" : ""}.
              </p>
            ) : (
              <p className="text-sm text-gray-400">No Reverse Journal Date is set on this journal, so no reversal exists.</p>
            )}
          </div>
        )}

        {tab === "activity" && (
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <ul className="space-y-4 text-sm">
              <li className="flex gap-3">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-300" />
                <div>
                  <p className="text-ink-700">
                    {journal.isReversal ? (
                      <>
                        Automatically generated as the reversal of Journal{" "}
                        {reversalOf ? (
                          <Link href={`/manual-journals/${reversalOf.id}`} className="text-brand-600 hover:underline">
                            {reversalOf.journal_number}
                          </Link>
                        ) : (
                          "-"
                        )}
                      </>
                    ) : (
                      "Journal created"
                    )}
                  </p>
                  <p className="text-xs text-gray-400">{formatDateTime(journal.createdAt)}</p>
                </div>
              </li>
              {journal.status === "published" && (
                <li className="flex gap-3">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                  <div>
                    <p className="text-ink-700">Currently Published</p>
                    <p className="text-xs text-gray-400">Reflected in reports as of {formatDate(journal.date)}</p>
                  </div>
                </li>
              )}
            </ul>
            <p className="mt-6 text-xs text-gray-400">
              This app doesn't keep a full edit-history audit log — the entries above are derived from the journal's own record, not a
              separate activity table.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
