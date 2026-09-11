"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Download, Printer, Mail } from "lucide-react";
import { formatCurrency, formatDate, toDateInputValue } from "@/lib/format";
import { generatePdfBlob, downloadPdfBlob } from "@/lib/pdf-export";
import SendEmailModal from "@/components/emails/SendEmailModal";

/** One AP-affecting event for this vendor — the purchases-side mirror of
 * CustomerStatementView.tsx's ARStatementEvent. `amount` is signed the way it affects the AP
 * balance: a Bill is positive (it's owed), a Payment Made or Vendor Credit is negative (it
 * reduces what's owed). Expenses are deliberately NOT included — they're paid immediately
 * through a bank/cash account (see syncExpenseJournal in auto-journal.ts: Dr Expense / Cr
 * Bank, no Accounts Payable line at all), so they never actually move this vendor's payable
 * balance the way a Bill does. Purchase Orders and Recurring Bills/Expenses aren't real
 * ledger events either (no GL effect), so they're excluded the same way Quotes/Sales Orders
 * are excluded from the Customer statement. */
export interface APStatementEvent {
  key: string;
  date: string;
  type: "Bill" | "Payment Made" | "Vendor Credit";
  refNumber: string;
  href: string;
  amount: number;
}

interface Props {
  vendorId: string;
  vendorName: string;
  vendorEmail: string | null;
  vendorAddressLines: string[];
  /** vendor.opening_balance — the balance carried in before any of `events`. */
  openingBalance: number;
  events: APStatementEvent[];
  org: { name: string; addressLines: string[]; logoDataUri?: string | null };
  currency: string;
}

type Preset = "this_month" | "last_month" | "this_quarter" | "this_year" | "custom";
type TypeFilter = "all" | APStatementEvent["type"];

function monthRange(year: number, month: number): [Date, Date] {
  return [new Date(year, month, 1), new Date(year, month + 1, 0)];
}

function presetRange(preset: Preset): [Date, Date] {
  const now = new Date();
  if (preset === "this_month") return monthRange(now.getFullYear(), now.getMonth());
  if (preset === "last_month") return monthRange(now.getFullYear(), now.getMonth() - 1);
  if (preset === "this_quarter") {
    const qStart = Math.floor(now.getMonth() / 3) * 3;
    return [new Date(now.getFullYear(), qStart, 1), new Date(now.getFullYear(), qStart + 3, 0)];
  }
  // this_year
  return [new Date(now.getFullYear(), 0, 1), new Date(now.getFullYear(), 11, 31)];
}

export default function VendorStatementView({
  vendorId,
  vendorName,
  vendorEmail,
  vendorAddressLines,
  openingBalance,
  events,
  org,
  currency,
}: Props) {
  const [preset, setPreset] = useState<Preset>("this_month");
  const [defaultFrom, defaultTo] = presetRange("this_month");
  const [from, setFrom] = useState(toDateInputValue(defaultFrom));
  const [to, setTo] = useState(toDateInputValue(defaultTo));
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const printRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [emailModalOpen, setEmailModalOpen] = useState(false);

  function applyPreset(p: Preset) {
    setPreset(p);
    if (p === "custom") return;
    const [f, t] = presetRange(p);
    setFrom(toDateInputValue(f));
    setTo(toDateInputValue(t));
  }

  const { openingAtPeriodStart, rows, billedAmount, amountPaid, balanceDue } = useMemo(() => {
    const sorted = [...events].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const pre = sorted.filter((e) => e.date < from);
    // "Filter By" only narrows which rows are displayed in the table below — it does NOT
    // change the opening balance carried forward (that always reflects every real event
    // before the period, regardless of the filter), matching how a real statement's running
    // balance shouldn't jump around just because the user is looking at one transaction type.
    const inPeriod = sorted.filter((e) => e.date >= from && e.date <= to);
    const inPeriodFiltered = typeFilter === "all" ? inPeriod : inPeriod.filter((e) => e.type === typeFilter);
    const openingAtStart = openingBalance + pre.reduce((sum, e) => sum + e.amount, 0);

    let running = openingAtStart;
    const builtRows = inPeriodFiltered.map((e) => {
      running += e.amount;
      return {
        ...e,
        debit: e.amount > 0 ? e.amount : 0,
        credit: e.amount < 0 ? -e.amount : 0,
        balance: running,
      };
    });

    const billed = inPeriod.filter((e) => e.type === "Bill").reduce((sum, e) => sum + e.amount, 0);
    const paid = inPeriod.filter((e) => e.type === "Payment Made").reduce((sum, e) => sum - e.amount, 0);
    // Balance Due always reflects the FULL in-period ledger (not the type filter) — the
    // filter is a display narrowing, not a different statement.
    const fullRunning = inPeriod.reduce((sum, e) => sum + e.amount, openingAtStart);

    return {
      openingAtPeriodStart: openingAtStart,
      rows: builtRows,
      billedAmount: billed,
      amountPaid: paid,
      balanceDue: fullRunning,
    };
  }, [events, from, to, openingBalance, typeFilter]);

  async function downloadPdf() {
    if (!printRef.current) return;
    setDownloading(true);
    try {
      const blob = await generatePdfBlob(printRef.current);
      downloadPdfBlob(blob, `Statement_${vendorName.replace(/[^a-z0-9]+/gi, "_")}_${from}_to_${to}.pdf`);
    } finally {
      setDownloading(false);
    }
  }

  const docNumber = `Statement_${from}_to_${to}`;

  return (
    <div>
      <style>{`@media print { .no-print { display: none !important; } }`}</style>

      <div className="no-print flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 bg-white px-6 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={preset}
            onChange={(e) => applyPreset(e.target.value as Preset)}
            className="input h-9 w-auto text-sm"
          >
            <option value="this_month">This Month</option>
            <option value="last_month">Last Month</option>
            <option value="this_quarter">This Quarter</option>
            <option value="this_year">This Year</option>
            <option value="custom">Custom</option>
          </select>
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPreset("custom");
            }}
            className="input h-9 w-auto text-sm"
          />
          <span className="text-sm text-gray-400">to</span>
          <input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPreset("custom");
            }}
            className="input h-9 w-auto text-sm"
          />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
            className="input h-9 w-auto text-sm"
            title="Filter which transaction types are shown in the table below"
          >
            <option value="all">Filter By: All</option>
            <option value="Bill">Bills</option>
            <option value="Payment Made">Payments Made</option>
            <option value="Vendor Credit">Vendor Credits</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => window.print()} className="btn-secondary">
            <Printer size={14} /> Print
          </button>
          <button type="button" onClick={downloadPdf} disabled={downloading} className="btn-primary">
            <Download size={14} /> {downloading ? "Preparing..." : "Download PDF"}
          </button>
          <button type="button" onClick={() => setEmailModalOpen(true)} className="btn-secondary">
            <Mail size={14} /> Send Email
          </button>
        </div>
      </div>

      <div className="no-print px-6 pt-4 text-center">
        <h2 className="text-base font-semibold text-ink-800">Vendor Statement For {vendorName}</h2>
        <p className="text-sm text-gray-500">
          From {formatDate(from)} To {formatDate(to)}
        </p>
      </div>

      <div className="p-6">
        <div className="mx-auto max-w-3xl overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
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
                <h2 className="text-2xl font-bold tracking-wide text-ink-900">STATEMENT OF ACCOUNTS</h2>
                <p className="mt-1 text-sm text-gray-500">
                  {formatDate(from)} to {formatDate(to)}
                </p>
              </div>
            </div>

            <div className="mt-6 border-t border-gray-100 pt-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">To</p>
              <p className="mt-1 text-sm font-medium text-ink-800">{vendorName}</p>
              {vendorAddressLines.map((line, i) => (
                <p key={i} className="text-sm text-gray-500">
                  {line}
                </p>
              ))}
            </div>

            <div className="mt-6 grid grid-cols-2 gap-4 border-t border-gray-100 pt-6 sm:grid-cols-4">
              <div className="rounded-md bg-gray-50 px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-gray-400">Opening Balance</p>
                <p className="mt-1 text-base font-semibold text-ink-800">{formatCurrency(openingAtPeriodStart, currency)}</p>
              </div>
              <div className="rounded-md bg-gray-50 px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-gray-400">Billed Amount</p>
                <p className="mt-1 text-base font-semibold text-ink-800">{formatCurrency(billedAmount, currency)}</p>
              </div>
              <div className="rounded-md bg-gray-50 px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-gray-400">Amount Paid</p>
                <p className="mt-1 text-base font-semibold text-ink-800">{formatCurrency(amountPaid, currency)}</p>
              </div>
              <div className="rounded-md bg-brand-50 px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-brand-500">Balance Due</p>
                <p className="mt-1 text-base font-semibold text-brand-700">{formatCurrency(balanceDue, currency)}</p>
              </div>
            </div>

            <div className="mt-6 border-t border-gray-100 pt-4">
              <table className="w-full text-left text-sm">
                <thead className="border-y border-gray-200 bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Transaction</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                    <th className="px-3 py-2 text-right">Payments</th>
                    <th className="px-3 py-2 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  <tr>
                    <td className="px-3 py-2 text-ink-500" colSpan={4}>
                      Opening Balance
                    </td>
                    <td className="px-3 py-2 text-right font-medium text-ink-800">{formatCurrency(openingAtPeriodStart, currency)}</td>
                  </tr>
                  {rows.map((r) => (
                    <tr key={r.key}>
                      <td className="whitespace-nowrap px-3 py-2 text-ink-700">{formatDate(r.date)}</td>
                      <td className="px-3 py-2 text-ink-700">
                        <Link href={r.href} className="text-brand-600 hover:underline">
                          {r.type} {r.refNumber}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-right text-ink-800">{r.debit > 0 ? formatCurrency(r.debit, currency) : "-"}</td>
                      <td className="px-3 py-2 text-right text-ink-800">{r.credit > 0 ? formatCurrency(r.credit, currency) : "-"}</td>
                      <td className="px-3 py-2 text-right font-medium text-ink-800">{formatCurrency(r.balance, currency)}</td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td className="px-3 py-6 text-center text-gray-400" colSpan={5}>
                        No transactions in this period.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-6 flex items-center justify-end border-t border-gray-100 pt-4">
              <p className="text-sm font-semibold text-ink-800">
                Balance Due &nbsp; <span className="text-base text-brand-700">{formatCurrency(balanceDue, currency)}</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      <SendEmailModal
        open={emailModalOpen}
        onClose={() => setEmailModalOpen(false)}
        entityType="vendors"
        entityId={vendorId}
        docNumber={docNumber}
        orgName={org.name}
        partyName={vendorName}
        defaultToEmail={vendorEmail}
        printRef={printRef}
      />
    </div>
  );
}
