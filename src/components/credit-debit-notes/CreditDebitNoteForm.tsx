"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/format";

interface ItemOption {
  value: string;
  label: string;
  salesPrice: number;
}

interface LineRow {
  key: string;
  item_id: string;
  description: string;
  quantity: number;
  rate: number;
}

interface Props {
  kind: "credit" | "debit";
  invoiceId: string;
  invoiceNumber: string;
  customerName: string;
  currency: string;
  /** Next auto-number from the org's number series — shown only as the number input's
   * placeholder, never pre-filled as its value. See the identical comment in
   * SalesOrderForm.tsx: claimNextNumber() only advances the series when the submitted
   * number is empty, so pre-filling it would resubmit the same literal string every time. */
  numberPreview?: string;
  defaultTaxPercent: number;
  itemOptions: ItemOption[];
  initialLines: { item_id: string; description: string; quantity: number; rate: number }[];
}

let seq = 0;
function newRow(): LineRow {
  seq += 1;
  return { key: `row-${seq}`, item_id: "", description: "", quantity: 1, rate: 0 };
}

function rowAmount(row: LineRow) {
  return Math.round(Number(row.quantity || 0) * Number(row.rate || 0) * 100) / 100;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function CreditDebitNoteForm({
  kind,
  invoiceId,
  invoiceNumber,
  customerName,
  currency,
  numberPreview,
  defaultTaxPercent,
  itemOptions,
  initialLines,
}: Props) {
  const router = useRouter();
  const label = kind === "credit" ? "Credit Note" : "Debit Note";

  const [number, setNumber] = useState<string>("");
  const [referenceNumber, setReferenceNumber] = useState<string>("");
  const [noteDate, setNoteDate] = useState<string>(todayStr());
  const [reason, setReason] = useState<string>("");
  const [taxPercent, setTaxPercent] = useState<number>(defaultTaxPercent);
  const [rows, setRows] = useState<LineRow[]>(() => {
    if (initialLines.length) {
      return initialLines.map((l) => {
        seq += 1;
        return { key: `row-${seq}`, item_id: l.item_id, description: l.description, quantity: l.quantity, rate: l.rate };
      });
    }
    return [newRow()];
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const subtotal = useMemo(() => rows.reduce((sum, r) => sum + rowAmount(r), 0), [rows]);
  const taxTotal = useMemo(() => Math.round(subtotal * (Number(taxPercent || 0) / 100) * 100) / 100, [subtotal, taxPercent]);
  const total = useMemo(() => Math.round((subtotal + taxTotal) * 100) / 100, [subtotal, taxTotal]);

  function updateRow(key: string, patch: Partial<LineRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function onItemSelect(key: string, itemId: string) {
    const item = itemOptions.find((o) => o.value === itemId);
    updateRow(key, { item_id: itemId, description: item ? item.label : "", rate: item ? item.salesPrice : 0 });
  }

  async function onSubmit() {
    setError(null);
    const validLines = rows.filter((r) => r.description.trim() && Number(r.quantity) > 0);
    if (validLines.length === 0) {
      setError("Add at least one line item.");
      return;
    }
    setSaving(true);
    const url = `/api/invoices/${invoiceId}/${kind === "credit" ? "credit-notes" : "debit-notes"}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        note_date: noteDate || null,
        reference_number: referenceNumber || null,
        reason: reason || null,
        lines: validLines.map((r) => ({
          item_id: r.item_id || null,
          description: r.description,
          quantity: Number(r.quantity),
          rate: Number(r.rate),
        })),
        taxPercent: Number(taxPercent) || 0,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === "string" ? data.error : "Something went wrong.");
      return;
    }
    router.push(`/invoices/${invoiceId}`);
    router.refresh();
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="space-y-6"
    >
      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
        <div>
          <label className="label">Customer Name</label>
          <div className="input flex items-center bg-gray-50 text-gray-600">{customerName}</div>
        </div>
        <div>
          <label className="label">Invoice#</label>
          <div className="input flex items-center bg-gray-50 text-gray-600">{invoiceNumber}</div>
        </div>

        <div>
          <label className="label">
            {label}# <span className="text-red-500">*</span>
          </label>
          <input
            className="input"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            placeholder={numberPreview ? `Auto: ${numberPreview}` : "Auto-generated if left blank"}
          />
        </div>
        <div>
          <label className="label">Reference#</label>
          <input className="input" value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} />
        </div>

        <div>
          <label className="label">
            {label} Date <span className="text-red-500">*</span>
          </label>
          <input className="input" type="date" value={noteDate} onChange={(e) => setNoteDate(e.target.value)} />
        </div>
        <div>
          <label className="label">Tax (%)</label>
          <input
            className="input"
            type="number"
            min={0}
            max={100}
            step="0.01"
            value={taxPercent}
            onChange={(e) => setTaxPercent(parseFloat(e.target.value) || 0)}
          />
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="label mb-0">Item Table</label>
          <button type="button" onClick={() => setRows((prev) => [...prev, newRow()])} className="btn-secondary py-1 text-xs">
            <Plus size={14} /> Add New Row
          </button>
        </div>
        <div className="overflow-x-auto rounded-md border border-gray-200">
          {/* table-fixed, not the browser default table-layout:auto — see the identical fix/
              comment in DocumentForm.tsx's line items table: plain `w-full` with auto layout
              lets the browser shrink every column to fit the wrapper's width instead of letting
              the overflow-x-auto wrapper scroll horizontally on a narrow viewport. table-fixed
              makes each column's width come only from its own <th>'s `w-*` class, independent
              of the others. */}
          <table className="w-full table-fixed text-left text-sm">
            <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="w-64 px-3 py-2">Item Details</th>
                <th className="w-24 px-3 py-2 text-right">Quantity</th>
                <th className="w-28 px-3 py-2 text-right">Rate</th>
                <th className="w-28 px-3 py-2 text-right">Amount</th>
                <th className="w-10 px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row) => (
                <tr key={row.key}>
                  <td className="px-3 py-1.5">
                    <select className="input" value={row.item_id} onChange={(e) => onItemSelect(row.key, e.target.value)}>
                      <option value="">Type or click to select an item</option>
                      {itemOptions.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <input
                      className="input mt-1 text-xs"
                      value={row.description}
                      onChange={(e) => updateRow(row.key, { description: e.target.value })}
                      placeholder="Description"
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      className="input text-right"
                      type="number"
                      min={0}
                      step="0.01"
                      value={row.quantity}
                      onChange={(e) => updateRow(row.key, { quantity: parseFloat(e.target.value) || 0 })}
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      className="input text-right"
                      type="number"
                      min={0}
                      step="0.01"
                      value={row.rate}
                      onChange={(e) => updateRow(row.key, { rate: parseFloat(e.target.value) || 0 })}
                    />
                  </td>
                  <td className="px-3 py-1.5 text-right font-medium text-ink-800">{formatCurrency(rowAmount(row), currency)}</td>
                  <td className="px-3 py-1.5 text-right">
                    <button
                      type="button"
                      onClick={() => setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== row.key) : prev))}
                      className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-col gap-6 sm:flex-row sm:justify-between">
        <div className="max-w-md flex-1">
          <label className="label">Reason</label>
          <textarea
            className="input"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={`Enter the reason for this ${label.toLowerCase()}`}
          />
        </div>
        <div className="flex w-56 flex-col items-end justify-start gap-1.5 pt-6">
          <div className="flex w-full items-center justify-between text-sm text-gray-600">
            <span>Sub Total</span>
            <span>{formatCurrency(subtotal, currency)}</span>
          </div>
          <div className="flex w-full items-center justify-between text-sm text-gray-600">
            <span>Tax ({Number(taxPercent || 0)}%)</span>
            <span>{formatCurrency(taxTotal, currency)}</span>
          </div>
          <div className="flex w-full items-center justify-between border-t border-gray-200 pt-1.5 text-base font-semibold text-ink-800">
            <span>Total ( {currency} )</span>
            <span>{formatCurrency(total, currency)}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-gray-100 pt-4">
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? "Saving..." : `Save ${label}`}
        </button>
        <button type="button" onClick={() => router.push(`/invoices/${invoiceId}`)} className="btn-secondary">
          Cancel
        </button>
      </div>
    </form>
  );
}
