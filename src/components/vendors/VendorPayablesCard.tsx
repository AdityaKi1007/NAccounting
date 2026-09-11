"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/format";
import OpeningBalanceModal from "@/components/ui/OpeningBalanceModal";

/** The Payables card on the Vendor Overview tab — Outstanding Payables plus a "View Opening
 * Balance" link that opens the Edit Opening Balance modal (matching the reference
 * screenshot), rather than the plain "Opening Balance <value> · Edit" line + full-edit-form
 * link this used before. A client component (unlike the rest of the Overview tab) because it
 * owns the modal's open/closed state and needs router.refresh() after a save to pull the
 * server component's freshly-recomputed Outstanding Payables figure. */
export default function VendorPayablesCard({
  vendorId,
  currency,
  displayCurrency,
  outstandingPayables,
  openingBalance,
}: {
  vendorId: string;
  currency: string;
  /** "AED - UAE Dirham" style label for the Currency column. */
  displayCurrency: string;
  outstandingPayables: number;
  openingBalance: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <div className="card p-0">
      <div className="border-b border-gray-100 px-5 py-3">
        <h2 className="text-sm font-semibold text-ink-800">Payables</h2>
      </div>
      {/* Deliberately no "Unused Credits" column, same call already made and disclosed on the
          Customer Receivables card: Vendor Credits (like Credit Notes) always apply directly
          against the vendor's AP balance rather than sitting in an open-credit pool, so
          there's no real tracked figure to show here beyond a column that would always read
          zero. */}
      <table className="w-full text-left text-sm">
        <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-5 py-2.5">Currency</th>
            <th className="px-5 py-2.5 text-right">Outstanding Payables</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="px-5 py-3 text-ink-700">{displayCurrency}</td>
            <td className="px-5 py-3 text-right text-ink-800">{formatCurrency(outstandingPayables, currency)}</td>
          </tr>
        </tbody>
      </table>
      <div className="border-t border-gray-100 px-5 py-3">
        <button type="button" onClick={() => setOpen(true)} className="text-sm text-brand-600 hover:underline">
          View Opening Balance
        </button>
      </div>

      <OpeningBalanceModal
        open={open}
        onClose={() => setOpen(false)}
        patchUrl={`/api/entities/vendors/${vendorId}`}
        currentValue={openingBalance}
        currency={currency}
        entityLabelPlural="vendors"
        onSaved={() => router.refresh()}
      />
    </div>
  );
}
