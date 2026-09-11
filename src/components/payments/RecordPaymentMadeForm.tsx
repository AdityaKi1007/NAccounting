"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/ui/Modal";
import Combobox, { type ComboboxOption } from "@/components/ui/Combobox";
import { formatCurrency, formatDate } from "@/lib/format";
import AttachmentsField from "@/components/attachments/AttachmentsField";
import { uploadPendingAttachments } from "@/lib/attachments-client";

interface OpenBill {
  id: string;
  billNumber: string;
  billDate: string;
  total: number;
  balanceDue: number;
}

const PAYMENT_MODES = [
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "credit_card", label: "Credit Card" },
  { value: "cheque", label: "Cheque" },
];

// Same default-allocation strategy as RecordPaymentForm.tsx's autoApply: fills each bill's
// balance due oldest-first, and re-runs whenever Amount Paid or the bill list changes.
function autoApply(amountPaid: number, bills: OpenBill[]): Record<string, number> {
  let remaining = amountPaid;
  const next: Record<string, number> = {};
  for (const bill of bills) {
    if (remaining <= 0) {
      next[bill.id] = 0;
      continue;
    }
    const applied = Math.min(remaining, bill.balanceDue);
    next[bill.id] = Math.round(applied * 100) / 100;
    remaining -= applied;
  }
  return next;
}

/** "Record Payment" for vendors — the mirror of RecordPaymentForm.tsx, built for the
 * "capture payments made and settling against open bills" half of the request: pick a
 * vendor, see their open bills, split Amount Paid across as many of them as needed in one
 * transaction (see payments-made-api.ts's createPaymentMade). */
export default function RecordPaymentMadeForm({
  vendorOptions,
  bankAccountOptions,
  currency,
  numberPreview,
}: {
  vendorOptions: ComboboxOption[];
  bankAccountOptions: ComboboxOption[];
  currency: string;
  numberPreview?: string;
}) {
  const router = useRouter();

  const [vendorId, setVendorId] = useState("");
  const [amountPaid, setAmountPaid] = useState("");
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [paymentNumber, setPaymentNumber] = useState("");
  const [paymentMode, setPaymentMode] = useState("cash");
  const [bankAccountId, setBankAccountId] = useState(bankAccountOptions[0]?.value ?? "");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [notes, setNotes] = useState("");

  const [bills, setBills] = useState<OpenBill[]>([]);
  const [loadingBills, setLoadingBills] = useState(false);
  const [allocations, setAllocations] = useState<Record<string, number>>({});

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<"draft" | "paid" | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  function close() {
    router.push("/payments-made");
    router.refresh();
  }

  useEffect(() => {
    if (!vendorId) {
      setBills([]);
      setAllocations({});
      return;
    }
    let cancelled = false;
    setLoadingBills(true);
    fetch(`/api/vendors/${vendorId}/open-bills`)
      .then((res) => (res.ok ? res.json() : { bills: [] }))
      .then((data: { bills: OpenBill[] }) => {
        if (cancelled) return;
        setBills(data.bills ?? []);
        setAllocations(autoApply(parseFloat(amountPaid) || 0, data.bills ?? []));
      })
      .finally(() => {
        if (!cancelled) setLoadingBills(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId]);

  useEffect(() => {
    if (bills.length === 0) return;
    setAllocations(autoApply(parseFloat(amountPaid) || 0, bills));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amountPaid]);

  const amountPaidNum = parseFloat(amountPaid) || 0;
  const totalApplied = Object.values(allocations).reduce((sum, v) => sum + (v || 0), 0);
  const amountInExcess = Math.max(0, Math.round((amountPaidNum - totalApplied) * 100) / 100);

  function setAllocation(billId: string, raw: string, cap: number) {
    const n = parseFloat(raw);
    const clamped = Number.isFinite(n) ? Math.min(Math.max(n, 0), cap) : 0;
    setAllocations((prev) => ({ ...prev, [billId]: clamped }));
  }

  function clearApplied() {
    const cleared: Record<string, number> = {};
    for (const b of bills) cleared[b.id] = 0;
    setAllocations(cleared);
  }

  async function save(status: "draft" | "paid") {
    setError(null);
    if (!vendorId) return setError("Vendor Name is required.");
    if (amountPaidNum <= 0) return setError("Amount Paid is required.");
    if (!paymentDate) return setError("Payment Date is required.");
    if (!bankAccountId) return setError("Paid Through is required.");
    if (totalApplied > amountPaidNum + 0.005) {
      return setError("Total payment applied to bills cannot exceed Amount Paid.");
    }

    setSaving(status);
    const res = await fetch("/api/payments-made", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vendor_id: vendorId,
        payment_number: paymentNumber.trim(),
        payment_date: paymentDate,
        amount: amountPaidNum,
        payment_mode: paymentMode,
        bank_account_id: bankAccountId,
        reference_number: referenceNumber || null,
        notes: notes || null,
        status,
        allocations: bills
          .filter((b) => (allocations[b.id] ?? 0) > 0)
          .map((b) => ({ bill_id: b.id, amount: allocations[b.id] })),
      }),
    });
    if (!res.ok) {
      setSaving(null);
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === "string" ? data.error : "Could not save this payment.");
      return;
    }
    const data = await res.json();
    if (pendingFiles.length > 0 && data.id) {
      const errors = await uploadPendingAttachments("payments-made", data.id, pendingFiles);
      if (errors.length > 0) alert(`Saved, but some files didn't upload:\n${errors.join("\n")}`);
    }
    setSaving(null);
    close();
  }

  return (
    <Modal open onClose={close} title="Record Payment" width="max-w-4xl">
      <div className="space-y-6">
        {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <div className="grid grid-cols-[180px_1fr] items-start gap-x-4 gap-y-4">
          <label className="label pt-2">
            Vendor Name<span className="text-red-500">*</span>
          </label>
          <div className="max-w-sm">
            <Combobox options={vendorOptions} value={vendorId} onChange={setVendorId} placeholder="Select Vendor" searchPlaceholder="Search" />
          </div>

          <label className="label pt-2">
            Amount Paid<span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            min="0"
            step="0.01"
            className="input max-w-sm"
            value={amountPaid}
            onChange={(e) => setAmountPaid(e.target.value)}
            disabled={!vendorId}
          />

          <label className="label pt-2">
            Payment Date<span className="text-red-500">*</span>
          </label>
          <input type="date" className="input max-w-sm" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />

          <label className="label pt-2">Payment #</label>
          <input
            type="text"
            className="input max-w-sm"
            value={paymentNumber}
            onChange={(e) => setPaymentNumber(e.target.value)}
            placeholder={numberPreview ? `Auto: ${numberPreview}` : "Auto-generated if left blank"}
          />

          <label className="label pt-2">Payment Mode</label>
          <select className="input max-w-sm" value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}>
            {PAYMENT_MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>

          <label className="label pt-2">
            Paid Through<span className="text-red-500">*</span>
          </label>
          <select className="input max-w-sm" value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)}>
            <option value="">Select an account</option>
            {bankAccountOptions.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>

          <label className="label pt-2">Reference#</label>
          <input type="text" className="input max-w-sm" value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} />
        </div>

        <div className="border-t border-gray-100 pt-5">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink-800">Open Bills</h3>
            <button type="button" onClick={clearApplied} className="text-xs font-medium text-brand-600 hover:underline">
              Clear Applied Amount
            </button>
          </div>

          {!vendorId ? (
            <div className="rounded-md border border-gray-100 bg-gray-50 py-8 text-center text-sm text-gray-400">
              Select a vendor to see their open bills.
            </div>
          ) : loadingBills ? (
            <div className="rounded-md border border-gray-100 bg-gray-50 py-8 text-center text-sm text-gray-400">Loading...</div>
          ) : (
            <div className="overflow-x-auto rounded-md border border-gray-100">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Bill Number</th>
                    <th className="px-3 py-2 text-right">Bill Amount</th>
                    <th className="px-3 py-2 text-right">Amount Due</th>
                    <th className="px-3 py-2 text-right">Payment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {bills.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-center text-sm text-gray-400">
                        There are no open bills associated with this vendor.
                      </td>
                    </tr>
                  ) : (
                    bills.map((bill) => (
                      <tr key={bill.id}>
                        <td className="px-3 py-2 text-ink-700">{formatDate(bill.billDate)}</td>
                        <td className="px-3 py-2 text-ink-700">{bill.billNumber}</td>
                        <td className="px-3 py-2 text-right text-ink-800">{formatCurrency(bill.total, currency)}</td>
                        <td className="px-3 py-2 text-right text-ink-800">{formatCurrency(bill.balanceDue, currency)}</td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            className="input py-1 text-right"
                            value={allocations[bill.id] ?? 0}
                            onChange={(e) => setAllocation(bill.id, e.target.value, bill.balanceDue)}
                          />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-3 flex items-start justify-between text-sm">
            {bills.length > 0 && <p className="text-xs text-gray-400">**List contains only OPEN bills</p>}
            <div className="ml-auto w-64 space-y-1.5">
              <div className="flex items-center justify-between text-ink-700">
                <span>Total</span>
                <span className="font-medium">{formatCurrency(totalApplied, currency)}</span>
              </div>
              <div className="flex items-center justify-between border-t border-gray-100 pt-1.5 text-ink-700">
                <span>Amount Paid:</span>
                <span>{formatCurrency(amountPaidNum, currency)}</span>
              </div>
              <div className="flex items-center justify-between text-ink-700">
                <span>Amount used for Payments:</span>
                <span>{formatCurrency(totalApplied, currency)}</span>
              </div>
              <div className="flex items-center justify-between font-medium text-amber-700">
                <span>Amount in Excess:</span>
                <span>{formatCurrency(amountInExcess, currency)}</span>
              </div>
            </div>
          </div>
        </div>

        <div>
          <label className="label">Notes (Internal use)</label>
          <textarea className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <AttachmentsField entityType="payments-made" entityId={null} pendingFiles={pendingFiles} onPendingFilesChange={setPendingFiles} label="Attach Files" />

        <div className="flex items-center gap-2 border-t border-gray-100 pt-4">
          <button type="button" onClick={() => save("draft")} disabled={saving !== null} className="btn-secondary">
            {saving === "draft" ? "Saving..." : "Save as Draft"}
          </button>
          <button type="button" onClick={() => save("paid")} disabled={saving !== null} className="btn-primary">
            {saving === "paid" ? "Saving..." : "Save as Paid"}
          </button>
          <button type="button" onClick={close} className="btn-secondary">
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}
