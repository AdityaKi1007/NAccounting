"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency, formatDate } from "@/lib/format";

interface InvoiceOption {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  status: string;
  total: number;
  balanceDue: number;
}

const STATUS_LABELS: Record<string, string> = {
  sent: "Sent",
  overdue: "Overdue",
  partially_paid: "Partially Paid",
  paid: "Paid",
};

export default function CreditNoteEntryPicker({
  customerOptions,
}: {
  customerOptions: { value: string; label: string }[];
}) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState("");
  const [invoices, setInvoices] = useState<InvoiceOption[]>([]);
  const [invoiceId, setInvoiceId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!customerId) {
      setInvoices([]);
      setInvoiceId("");
      return;
    }
    setLoading(true);
    setError(null);
    fetch(`/api/customers/${customerId}/creditable-invoices`)
      .then((res) => (res.ok ? res.json() : { invoices: [] }))
      .then((data: { invoices: InvoiceOption[] }) => {
        setInvoices(data.invoices ?? []);
        setInvoiceId("");
      })
      .finally(() => setLoading(false));
  }, [customerId]);

  function onContinue() {
    if (!customerId) return setError("Customer Name is required.");
    if (!invoiceId) return setError("Select an invoice to credit.");
    router.push(`/invoices/${invoiceId}/credit-note/new`);
  }

  return (
    <div className="space-y-5">
      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div>
        <label className="label">
          Customer Name<span className="text-red-500"> *</span>
        </label>
        <select className="input" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
          <option value="">Select Customer</option>
          {customerOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="label">
          Invoice<span className="text-red-500"> *</span>
        </label>
        {!customerId ? (
          <p className="text-sm text-gray-400">Select a customer to see their eligible invoices.</p>
        ) : loading ? (
          <p className="text-sm text-gray-400">Loading invoices...</p>
        ) : invoices.length === 0 ? (
          <p className="text-sm text-gray-400">
            This customer has no invoices eligible for a credit note (only Sent, Overdue, Partially Paid, or Paid
            invoices can be credited — Draft and Void invoices can't).
          </p>
        ) : (
          <div className="overflow-hidden rounded-md border border-gray-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="w-8 px-3 py-2"></th>
                  <th className="px-3 py-2">Invoice #</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2 text-right">Balance Due</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {invoices.map((inv) => (
                  <tr
                    key={inv.id}
                    className="cursor-pointer hover:bg-gray-50"
                    onClick={() => setInvoiceId(inv.id)}
                  >
                    <td className="px-3 py-2">
                      <input
                        type="radio"
                        name="invoice"
                        checked={invoiceId === inv.id}
                        onChange={() => setInvoiceId(inv.id)}
                        className="h-4 w-4 border-gray-300 text-brand-600 focus:ring-brand-500"
                      />
                    </td>
                    <td className="px-3 py-2 font-medium text-ink-800">{inv.invoiceNumber}</td>
                    <td className="px-3 py-2 text-ink-700">{formatDate(inv.invoiceDate)}</td>
                    <td className="px-3 py-2 text-ink-700">{STATUS_LABELS[inv.status] ?? inv.status}</td>
                    <td className="px-3 py-2 text-right text-ink-700">{formatCurrency(inv.total)}</td>
                    <td className="px-3 py-2 text-right text-ink-700">{formatCurrency(inv.balanceDue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-gray-100 pt-4">
        <button type="button" onClick={onContinue} disabled={!customerId || !invoiceId} className="btn-primary">
          Continue
        </button>
        <button type="button" onClick={() => router.push("/credit-notes")} className="btn-secondary">
          Cancel
        </button>
      </div>
    </div>
  );
}
