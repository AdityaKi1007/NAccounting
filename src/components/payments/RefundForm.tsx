"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/ui/Modal";
import { formatCurrency } from "@/lib/format";

interface Option {
  value: string;
  label: string;
}

const PAYMENT_MODES = [
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "credit_card", label: "Credit Card" },
  { value: "cheque", label: "Cheque" },
];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

/** "Refund" — matches the Zoho Books reference screenshot the user asked to follow, reached
 * from a Paid Payment Received's own detail view (see PaymentDetailView.tsx's "Refund"
 * button). This app's Chart of Accounts has no retainer/advance-payment concept, so unlike
 * Zoho's own Refund Type select this only ever offers "Excess Amount Refund" — the dropdown
 * is still shown (to match the screenshot's layout) but with a single, fixed option. The
 * server (createPaymentRefund in payment-refunds-api.ts) re-derives the real excess amount
 * and rejects anything over it, so the client-side cap here is a convenience, not the source
 * of truth. */
export default function RefundForm({
  paymentId,
  paymentNumber,
  isPaid,
  customerName,
  totalAmountReceived,
  amountApplied,
  previouslyRefunded,
  excessAmount,
  bankAccountOptions,
  defaultFromAccountId,
  currency,
}: {
  paymentId: string;
  paymentNumber: string;
  isPaid: boolean;
  customerName: string;
  totalAmountReceived: number;
  amountApplied: number;
  previouslyRefunded: number;
  excessAmount: number;
  bankAccountOptions: Option[];
  defaultFromAccountId: string;
  currency: string;
}) {
  const router = useRouter();

  const [amount, setAmount] = useState(excessAmount > 0 ? String(excessAmount) : "");
  const [refundedOn, setRefundedOn] = useState(todayStr());
  const [paymentMode, setPaymentMode] = useState("cash");
  const [fromAccountId, setFromAccountId] = useState(defaultFromAccountId);
  const [referenceNumber, setReferenceNumber] = useState("");
  const [description, setDescription] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function close() {
    router.push(`/payments-received/${paymentId}`);
    router.refresh();
  }

  const amountNum = parseFloat(amount) || 0;

  async function save() {
    setError(null);
    if (amountNum <= 0) return setError("Amount is required.");
    if (amountNum > excessAmount + 0.005) return setError(`Only ${formatCurrency(excessAmount, currency)} is available to refund.`);
    if (!refundedOn) return setError("Refunded On is required.");
    if (!fromAccountId) return setError("From Account is required.");

    setSaving(true);
    const res = await fetch(`/api/payments-received/${paymentId}/refund`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: amountNum,
        refunded_on: refundedOn,
        payment_mode: paymentMode,
        from_account_id: fromAccountId,
        reference_number: referenceNumber || null,
        description: description || null,
      }),
    });
    if (!res.ok) {
      setSaving(false);
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === "string" ? data.error : "Could not save this refund.");
      return;
    }
    setSaving(false);
    close();
  }

  return (
    <Modal open onClose={close} title="Refund" width="max-w-2xl">
      <div className="space-y-6">
        {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        {!isPaid ? (
          <p className="text-sm text-gray-500">Only a Paid payment can be refunded.</p>
        ) : excessAmount <= 0.005 ? (
          <p className="text-sm text-gray-500">
            There&apos;s no excess amount left to refund on {paymentNumber} — the full amount is applied to invoices.
          </p>
        ) : (
          <>
            <div>
              <p className="label mb-1">Customer Name</p>
              <p className="text-sm font-medium text-ink-800">{customerName}</p>
            </div>

            <div className="grid grid-cols-1 gap-4 rounded-md bg-gray-50 p-4 sm:grid-cols-[1fr_auto] sm:items-start">
              <div className="space-y-3">
                <div>
                  <label className="label">Refund Type</label>
                  <select className="input max-w-xs" value="excess_amount" disabled>
                    <option value="excess_amount">Excess Amount Refund</option>
                  </select>
                </div>
                <div>
                  <label className="label">
                    Amount<span className="text-red-500">*</span>
                  </label>
                  <div className="flex max-w-xs">
                    <span className="input flex items-center rounded-r-none border-r-0 bg-gray-100 px-3 text-sm text-gray-500">
                      {currency}
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="input rounded-l-none"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                    />
                  </div>
                </div>
              </div>
              <div className="rounded-md border border-dashed border-gray-300 bg-white p-3 text-xs">
                <div className="flex items-center justify-between gap-6 py-0.5">
                  <span className="text-gray-500">Total Amount Received :</span>
                  <span className="font-medium text-ink-800">{formatCurrency(totalAmountReceived, currency)}</span>
                </div>
                <div className="flex items-center justify-between gap-6 py-0.5">
                  <span className="text-gray-500">Amount Applied to Invoices :</span>
                  <span className="font-medium text-ink-800">{formatCurrency(amountApplied, currency)}</span>
                </div>
                <div className="flex items-center justify-between gap-6 py-0.5">
                  <span className="text-gray-500">Previously Refunded Amount :</span>
                  <span className="font-medium text-ink-800">{formatCurrency(previouslyRefunded, currency)}</span>
                </div>
                <div className="flex items-center justify-between gap-6 py-0.5">
                  <span className="text-gray-500">Excess Amount :</span>
                  <span className="font-medium text-ink-800">{formatCurrency(excessAmount, currency)}</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="label">
                  Refunded On<span className="text-red-500">*</span>
                </label>
                <input type="date" className="input" value={refundedOn} onChange={(e) => setRefundedOn(e.target.value)} />
              </div>
              <div>
                <label className="label">Payment Mode</label>
                <select className="input" value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}>
                  {PAYMENT_MODES.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Reference#</label>
                <input type="text" className="input" value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} />
              </div>
              <div>
                <label className="label">
                  From Account<span className="text-red-500">*</span>
                </label>
                <select className="input" value={fromAccountId} onChange={(e) => setFromAccountId(e.target.value)}>
                  <option value="">Select an account</option>
                  {bankAccountOptions.map((a) => (
                    <option key={a.value} value={a.value}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="label">Description</label>
              <textarea className="input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
          </>
        )}

        <div className="flex items-center gap-2 border-t border-gray-100 pt-4">
          {isPaid && excessAmount > 0.005 && (
            <button type="button" onClick={save} disabled={saving} className="btn-primary">
              {saving ? "Saving..." : "Save"}
            </button>
          )}
          <button type="button" onClick={close} className="btn-secondary">
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}
