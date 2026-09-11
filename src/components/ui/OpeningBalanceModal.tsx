"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/ui/Modal";
import { formatCurrency } from "@/lib/format";

/** Generic "Edit Opening Balance" modal, matching the reference Zoho screenshot: a single
 * Opening Balance input, a read-only "Outstanding Opening Balance" line showing what's
 * currently saved, a Tax Update note about VAT-return implications, and Save/Cancel.
 *
 * This replaces the plain "Opening Balance <value> · Edit" line + full-edit-form link that
 * both the Customer and Vendor detail pages used previously — this modal edits just the one
 * field in place instead of sending the user through the whole edit form.
 *
 * `patchUrl` + a hardcoded `opening_balance` body key is deliberately generic (works for any
 * entity whose table has a plain `opening_balance` numeric column and whose PATCH endpoint
 * does a true partial update), but is only wired up to Vendors for now
 * (`/api/entities/vendors/[id]`, a true partial update per src/lib/crud.ts's updateRow).
 * Customers are NOT wired to this modal yet: `/api/customers/[id]` PATCH unconditionally
 * replaces every customer_contacts row from `body.contacts ?? []` (see the "PATCH-wipes-
 * contacts landmine" documented on the Customer detail page's own history) — a partial PATCH
 * with only `opening_balance` set would silently delete that customer's contact persons. Using
 * this modal for Customers safely needs either a dedicated opening-balance-only endpoint or
 * resending the customer's current contacts array, neither of which was built this round. */
export default function OpeningBalanceModal({
  open,
  onClose,
  patchUrl,
  currentValue,
  currency,
  /** Drives the Tax Update note's wording ("vendors"/"a bill" vs "customers"/"an invoice"). */
  entityLabelPlural,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  patchUrl: string;
  currentValue: number;
  currency: string;
  entityLabelPlural: "vendors" | "customers";
  onSaved: () => void;
}) {
  const [value, setValue] = useState(String(currentValue));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-seed every time the modal opens (not on every keystroke) — same pattern as
  // SendEmailModal, since this modal also stays mounted between opens.
  useEffect(() => {
    if (!open) return;
    setValue(String(currentValue));
    setError(null);
  }, [open, currentValue]);

  async function save() {
    const num = Number(value);
    if (Number.isNaN(num)) {
      setError("Enter a valid number.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(patchUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opening_balance: num }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not save the opening balance.");
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the opening balance.");
    } finally {
      setSaving(false);
    }
  }

  const docWord = entityLabelPlural === "vendors" ? "bill" : "invoice";

  return (
    <Modal open={open} onClose={onClose} title="Edit Opening Balance" width="max-w-md">
      <div className="space-y-4">
        <div>
          <label className="label">Opening Balance</label>
          <input
            type="number"
            step="0.01"
            className="input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
          />
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Outstanding Opening Balance</p>
          <p className="mt-0.5 text-sm font-medium text-ink-800">{formatCurrency(currentValue, currency)}</p>
        </div>
        <p className="rounded-md bg-gray-50 p-3 text-xs leading-relaxed text-gray-500">
          <span className="font-semibold text-ink-700">Tax Update: </span>
          The opening balance for your {entityLabelPlural} will not be included in your VAT Return if your Migration Date is on or after
          your first VAT return generation date. If you want the amount to be included in your VAT Return, record it by creating a{" "}
          {docWord} after your VAT return generation date.
        </p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary" disabled={saving}>
            Cancel
          </button>
          <button type="button" onClick={save} disabled={saving} className="btn-primary">
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
