"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/ui/Modal";
import Combobox, { type ComboboxOption } from "@/components/ui/Combobox";
import { formatCurrency, formatDate } from "@/lib/format";
import AttachmentsField from "@/components/attachments/AttachmentsField";
import { uploadPendingAttachments } from "@/lib/attachments-client";

interface UnpaidInvoice {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  total: number;
  balanceDue: number;
}

const PAYMENT_MODES = [
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "credit_card", label: "Credit Card" },
  { value: "cheque", label: "Cheque" },
];

// Splits amountReceived across invoices oldest-first, filling each invoice's balance due
// before moving to the next — the same default Zoho applies a payment with. Runs fresh
// every time Amount Received or the invoice list changes, so it overwrites any per-row
// amounts the user typed by hand; "Clear Applied Amount" and manual edits are meant for
// fine-tuning right before Save, not for surviving further changes to Amount Received.
function autoApply(amountReceived: number, invoices: UnpaidInvoice[]): Record<string, number> {
  let remaining = amountReceived;
  const next: Record<string, number> = {};
  for (const inv of invoices) {
    if (remaining <= 0) {
      next[inv.id] = 0;
      continue;
    }
    const applied = Math.min(remaining, inv.balanceDue);
    next[inv.id] = Math.round(applied * 100) / 100;
    remaining -= applied;
  }
  return next;
}

export default function RecordPaymentForm({
  customerOptions,
  bankAccountOptions,
  projectOptions = [],
  unitOptions = [],
  currency,
  numberPreview,
}: {
  customerOptions: ComboboxOption[];
  bankAccountOptions: ComboboxOption[];
  /** Optional Property Master Project/Unit tags — see payments_received.project_id/unit_id. */
  projectOptions?: ComboboxOption[];
  unitOptions?: ComboboxOption[];
  currency: string;
  /** Next auto-number from the org's Payments Received number series, shown only as the
   * Payment # input's placeholder — never pre-filled as its value (see RecordPaymentFormPage). */
  numberPreview?: string;
}) {
  const router = useRouter();

  const [customerId, setCustomerId] = useState("");
  const [amountReceived, setAmountReceived] = useState("");
  const [bankCharges, setBankCharges] = useState("");
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [paymentNumber, setPaymentNumber] = useState("");
  const [paymentMode, setPaymentMode] = useState("cash");
  const [bankAccountId, setBankAccountId] = useState(bankAccountOptions[0]?.value ?? "");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [projectId, setProjectId] = useState("");
  const [unitId, setUnitId] = useState("");

  const [invoices, setInvoices] = useState<UnpaidInvoice[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [allocations, setAllocations] = useState<Record<string, number>>({});

  const [showDateFilter, setShowDateFilter] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<"draft" | "paid" | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  function close() {
    router.push("/payments-received");
    router.refresh();
  }

  // Load the selected customer's unpaid invoices, then auto-apply whatever Amount Received
  // currently holds against them.
  useEffect(() => {
    if (!customerId) {
      setInvoices([]);
      setAllocations({});
      return;
    }
    let cancelled = false;
    setLoadingInvoices(true);
    fetch(`/api/customers/${customerId}/unpaid-invoices`)
      .then((res) => (res.ok ? res.json() : { invoices: [] }))
      .then((data: { invoices: UnpaidInvoice[] }) => {
        if (cancelled) return;
        setInvoices(data.invoices ?? []);
        setAllocations(autoApply(parseFloat(amountReceived) || 0, data.invoices ?? []));
      })
      .finally(() => {
        if (!cancelled) setLoadingInvoices(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  // Re-run the auto-apply split whenever Amount Received changes against the invoices
  // already loaded (see autoApply's note on why this overwrites manual row edits).
  useEffect(() => {
    if (invoices.length === 0) return;
    setAllocations(autoApply(parseFloat(amountReceived) || 0, invoices));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amountReceived]);

  const visibleInvoices = useMemo(() => {
    if (!dateFrom && !dateTo) return invoices;
    return invoices.filter((inv) => {
      const d = inv.invoiceDate.slice(0, 10);
      if (dateFrom && d < dateFrom) return false;
      if (dateTo && d > dateTo) return false;
      return true;
    });
  }, [invoices, dateFrom, dateTo]);

  const amountReceivedNum = parseFloat(amountReceived) || 0;
  const totalApplied = Object.values(allocations).reduce((sum, v) => sum + (v || 0), 0);
  const amountInExcess = Math.max(0, Math.round((amountReceivedNum - totalApplied) * 100) / 100);

  function setAllocation(invoiceId: string, raw: string, cap: number) {
    const n = parseFloat(raw);
    const clamped = Number.isFinite(n) ? Math.min(Math.max(n, 0), cap) : 0;
    setAllocations((prev) => ({ ...prev, [invoiceId]: clamped }));
  }

  function clearApplied() {
    const cleared: Record<string, number> = {};
    for (const inv of invoices) cleared[inv.id] = 0;
    setAllocations(cleared);
  }

  async function save(status: "draft" | "paid") {
    setError(null);
    if (!customerId) return setError("Customer Name is required.");
    if (amountReceivedNum <= 0) return setError("Amount Received is required.");
    if (!paymentDate) return setError("Payment Date is required.");
    if (!bankAccountId) return setError("Deposit To is required.");
    if (totalApplied > amountReceivedNum + 0.005) {
      return setError("Total payment applied to invoices cannot exceed Amount Received.");
    }

    setSaving(status);
    const res = await fetch("/api/payments-received", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer_id: customerId,
        payment_number: paymentNumber.trim(),
        payment_date: paymentDate,
        amount: amountReceivedNum,
        bank_charges: parseFloat(bankCharges) || 0,
        payment_mode: paymentMode,
        bank_account_id: bankAccountId,
        reference_number: referenceNumber || null,
        notes: notes || null,
        project_id: projectId || null,
        unit_id: unitId || null,
        status,
        allocations: invoices
          .filter((inv) => (allocations[inv.id] ?? 0) > 0)
          .map((inv) => ({ invoice_id: inv.id, amount: allocations[inv.id] })),
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
      // Same pattern as the other create forms: the payment is already saved, so an
      // attachment failure surfaces via alert() rather than blocking the redirect.
      const errors = await uploadPendingAttachments("payments-received", data.id, pendingFiles);
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
            Customer Name<span className="text-red-500">*</span>
          </label>
          <div className="max-w-sm">
            <Combobox
              options={customerOptions}
              value={customerId}
              onChange={setCustomerId}
              placeholder="Select Customer"
              searchPlaceholder="Search"
            />
          </div>

          <label className="label pt-2">
            Amount Received<span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            min="0"
            step="0.01"
            className="input max-w-sm"
            value={amountReceived}
            onChange={(e) => setAmountReceived(e.target.value)}
            disabled={!customerId}
          />

          <label className="label pt-2">Bank Charges (if any)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            className="input max-w-sm"
            value={bankCharges}
            onChange={(e) => setBankCharges(e.target.value)}
            disabled={!customerId}
          />

          <label className="label pt-2">
            Payment Date<span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            className="input max-w-sm"
            value={paymentDate}
            onChange={(e) => setPaymentDate(e.target.value)}
          />

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
            Deposit To<span className="text-red-500">*</span>
          </label>
          <select
            className="input max-w-sm"
            value={bankAccountId}
            onChange={(e) => setBankAccountId(e.target.value)}
          >
            <option value="">Select an account</option>
            {bankAccountOptions.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>

          <label className="label pt-2">Reference#</label>
          <input
            type="text"
            className="input max-w-sm"
            value={referenceNumber}
            onChange={(e) => setReferenceNumber(e.target.value)}
          />

          <label className="label pt-2">Project</label>
          <select className="input max-w-sm" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">Select Project</option>
            {projectOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          <label className="label pt-2">Unit</label>
          <select className="input max-w-sm" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
            <option value="">Select Unit</option>
            {unitOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="border-t border-gray-100 pt-5">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-semibold text-ink-800">Unpaid Invoices</h3>
              <button
                type="button"
                onClick={() => setShowDateFilter((v) => !v)}
                className="text-xs font-medium text-gray-500 hover:text-brand-600"
              >
                Filter by Date Range
              </button>
            </div>
            <button type="button" onClick={clearApplied} className="text-xs font-medium text-brand-600 hover:underline">
              Clear Applied Amount
            </button>
          </div>

          {showDateFilter && (
            <div className="mb-3 flex items-center gap-2 text-xs text-gray-600">
              <span>From</span>
              <input type="date" className="input w-auto py-1 text-xs" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              <span>To</span>
              <input type="date" className="input w-auto py-1 text-xs" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
          )}

          {!customerId ? (
            <div className="rounded-md border border-gray-100 bg-gray-50 py-8 text-center text-sm text-gray-400">
              Select a customer to see their unpaid invoices.
            </div>
          ) : loadingInvoices ? (
            <div className="rounded-md border border-gray-100 bg-gray-50 py-8 text-center text-sm text-gray-400">Loading...</div>
          ) : (
            <div className="overflow-x-auto rounded-md border border-gray-100">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Invoice Number</th>
                    <th className="px-3 py-2 text-right">Invoice Amount</th>
                    <th className="px-3 py-2 text-right">Amount Due</th>
                    <th className="px-3 py-2" title="The date a payment was previously recorded against this invoice.">
                      Payment Received On
                    </th>
                    <th className="px-3 py-2 text-right">Payment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {visibleInvoices.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-sm text-gray-400">
                        There are no unpaid invoices associated with this customer.
                      </td>
                    </tr>
                  ) : (
                    visibleInvoices.map((inv) => (
                      <tr key={inv.id}>
                        <td className="px-3 py-2 text-ink-700">{formatDate(inv.invoiceDate)}</td>
                        <td className="px-3 py-2 text-ink-700">{inv.invoiceNumber}</td>
                        <td className="px-3 py-2 text-right text-ink-800">{formatCurrency(inv.total, currency)}</td>
                        <td className="px-3 py-2 text-right text-ink-800">{formatCurrency(inv.balanceDue, currency)}</td>
                        <td className="px-3 py-2 text-gray-400">-</td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            className="input py-1 text-right"
                            value={allocations[inv.id] ?? 0}
                            onChange={(e) => setAllocation(inv.id, e.target.value, inv.balanceDue)}
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
            {visibleInvoices.length > 0 && (
              <p className="text-xs text-gray-400">**List contains only SENT invoices</p>
            )}
            <div className="ml-auto w-64 space-y-1.5">
              <div className="flex items-center justify-between text-ink-700">
                <span>Total</span>
                <span className="font-medium">{formatCurrency(totalApplied, currency)}</span>
              </div>
              <div className="flex items-center justify-between border-t border-gray-100 pt-1.5 text-ink-700">
                <span>Amount Received:</span>
                <span>{formatCurrency(amountReceivedNum, currency)}</span>
              </div>
              <div className="flex items-center justify-between text-ink-700">
                <span>Amount used for Payments:</span>
                <span>{formatCurrency(totalApplied, currency)}</span>
              </div>
              <div className="flex items-center justify-between text-ink-700">
                <span>Amount Refunded:</span>
                <span>{formatCurrency(0, currency)}</span>
              </div>
              <div className="flex items-center justify-between font-medium text-amber-700">
                <span>Amount in Excess:</span>
                <span>{formatCurrency(amountInExcess, currency)}</span>
              </div>
            </div>
          </div>
        </div>

        <div>
          <label className="label">Notes (Internal use, not visible to customer)</label>
          <textarea className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <AttachmentsField
          entityType="payments-received"
          entityId={null}
          pendingFiles={pendingFiles}
          onPendingFilesChange={setPendingFiles}
          label="Attach Files"
        />

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
