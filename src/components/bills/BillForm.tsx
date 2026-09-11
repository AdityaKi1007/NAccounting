"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import Combobox, { type ComboboxOption } from "@/components/ui/Combobox";
import { formatCurrency } from "@/lib/format";
import AttachmentsField from "@/components/attachments/AttachmentsField";
import { uploadPendingAttachments } from "@/lib/attachments-client";

export type BillOption = ComboboxOption;
export interface BillItemOption extends BillOption {
  purchasePrice: number;
}
interface TaxRateOption extends BillOption {
  rate: number;
}

const PAYMENT_TERMS: BillOption[] = [
  { label: "Due on Receipt", value: "due_on_receipt" },
  { label: "Net 15", value: "net_15" },
  { label: "Net 30", value: "net_30" },
  { label: "Net 45", value: "net_45" },
  { label: "Net 60", value: "net_60" },
];

const TERM_DAYS: Record<string, number> = { due_on_receipt: 0, net_15: 15, net_30: 30, net_45: 45, net_60: 60 };

const round2 = (n: number) => Math.round(n * 100) / 100;

function toDateInput(v: unknown) {
  // See ExpenseForm.tsx's identical helper: a pg `date` column comes back as a JS Date
  // object, so String(v) alone doesn't produce "YYYY-MM-DD".
  if (!v) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

let seq = 0;
interface LineRow {
  key: string;
  item_id: string;
  description: string;
  quantity: string;
  rate: string;
  account_id: string;
  tax_rate_id: string;
  customer_id: string;
}
function newRow(): LineRow {
  seq += 1;
  return { key: `row-${seq}`, item_id: "", description: "", quantity: "1", rate: "0", account_id: "", tax_rate_id: "", customer_id: "" };
}

interface Props {
  recordId?: string;
  initial: { header: Record<string, unknown>; lines: Record<string, unknown>[] } | null;
  currency: string;
  numberPreview?: string;
  vendorOptions: BillOption[];
  accountOptions: BillOption[];
  apAccountOptions: BillOption[];
  itemOptions: BillItemOption[];
  taxRateOptions: TaxRateOption[];
  customerOptions: BillOption[];
}

/** Bespoke "New Bill" form matching the Zoho Books reference screenshot. Not the generic
 * DocumentForm (which every other document type — quotes/invoices/sales & purchase orders —
 * still uses): a bill line needs its own Account/Tax/Customer Details columns, none of which
 * DocumentForm's item table has — see bills-api.ts and the migration it was built from for
 * why. Tax Exclusive / At Transaction Level are shown to match the screenshot but are
 * inert display only (this build always computes tax exclusive, at line-item level — the
 * only real accounting Zoho supports that this app doesn't offer a toggle for), same
 * "capture the control, not the behavior" scope call already made for Expenses' Reverse
 * Charge checkbox. */
export default function BillForm({
  recordId,
  initial,
  currency,
  numberPreview,
  vendorOptions,
  accountOptions,
  apAccountOptions,
  itemOptions,
  taxRateOptions,
  customerOptions,
}: Props) {
  const router = useRouter();
  const h = initial?.header ?? {};

  const [vendorId, setVendorId] = useState(String(h.vendor_id ?? ""));
  const [billNumber, setBillNumber] = useState(String(h.bill_number ?? ""));
  const [orderNumber, setOrderNumber] = useState(String(h.order_number ?? ""));
  const [permitNumber, setPermitNumber] = useState(String(h.permit_number ?? ""));
  const [billDate, setBillDate] = useState(toDateInput(h.bill_date) || new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(toDateInput(h.due_date));
  const [paymentTerms, setPaymentTerms] = useState(String(h.payment_terms ?? "due_on_receipt"));
  const [apAccountId, setApAccountId] = useState(String(h.accounts_payable_account_id ?? apAccountOptions[0]?.value ?? ""));
  const [subject, setSubject] = useState(String(h.subject ?? ""));
  const [notes, setNotes] = useState(String(h.notes ?? ""));

  const [rows, setRows] = useState<LineRow[]>(() => {
    if (initial?.lines?.length) {
      return initial.lines.map((l) => {
        seq += 1;
        return {
          key: `row-${seq}`,
          item_id: String(l.item_id ?? ""),
          description: String(l.description ?? ""),
          quantity: String(l.quantity ?? "1"),
          rate: String(l.rate ?? "0"),
          account_id: String(l.account_id ?? ""),
          tax_rate_id: String(l.tax_rate_id ?? ""),
          customer_id: String(l.customer_id ?? ""),
        };
      });
    }
    return [newRow()];
  });

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<"draft" | "open" | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  function updateRow(key: string, patch: Partial<LineRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function onItemSelect(key: string, itemId: string) {
    const item = itemOptions.find((o) => o.value === itemId);
    updateRow(key, { item_id: itemId, description: item ? item.label : "", rate: item ? String(item.purchasePrice) : "0" });
  }

  function onDueDateAuto(terms: string, base: string) {
    // A convenience default only, not a lock: picking Payment Terms fills in Due Date from
    // the Bill Date, same as Zoho, but the user can still hand-edit Due Date afterward and
    // this won't fight them — it only fires from the Payment Terms select's own onChange.
    const days = TERM_DAYS[terms];
    if (days === undefined || !base) return;
    const d = new Date(base);
    d.setDate(d.getDate() + days);
    setDueDate(d.toISOString().slice(0, 10));
  }

  const computedRows = useMemo(
    () =>
      rows.map((r) => {
        const qty = parseFloat(r.quantity) || 0;
        const rate = parseFloat(r.rate) || 0;
        const amount = round2(qty * rate);
        const taxRate = taxRateOptions.find((t) => t.value === r.tax_rate_id)?.rate ?? 0;
        const taxAmount = round2((amount * taxRate) / 100);
        return { ...r, amount, taxAmount };
      }),
    [rows, taxRateOptions]
  );
  const subtotal = round2(computedRows.reduce((sum, r) => sum + r.amount, 0));
  const taxTotal = round2(computedRows.reduce((sum, r) => sum + r.taxAmount, 0));
  const total = round2(subtotal + taxTotal);

  async function save(status: "draft" | "open") {
    setError(null);
    if (!vendorId) return setError("Vendor Name is required.");
    if (!billDate) return setError("Bill Date is required.");
    const validLines = rows.filter((r) => r.description.trim() && Number(r.quantity) > 0);
    if (validLines.length === 0) return setError("Add at least one line item.");
    if (validLines.some((r) => !r.account_id)) return setError("Select an Account for every line item.");

    setSaving(status);
    const url = recordId ? `/api/bills/${recordId}` : `/api/bills`;
    const method = recordId ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bill_number: billNumber.trim() || undefined,
        vendor_id: vendorId,
        bill_date: billDate,
        due_date: dueDate || null,
        order_number: orderNumber || null,
        permit_number: permitNumber || null,
        subject: subject || null,
        payment_terms: paymentTerms,
        accounts_payable_account_id: apAccountId || null,
        status,
        notes: notes || null,
        lines: validLines.map((r) => ({
          item_id: r.item_id || null,
          description: r.description,
          quantity: Number(r.quantity),
          rate: Number(r.rate),
          account_id: r.account_id,
          tax_rate_id: r.tax_rate_id || null,
          customer_id: r.customer_id || null,
        })),
      }),
    });
    if (!res.ok) {
      setSaving(null);
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === "string" ? data.error : "Something went wrong.");
      return;
    }
    const data = await res.json();
    const newId = data.id as string | undefined;
    if (!recordId && newId && pendingFiles.length > 0) {
      const errors = await uploadPendingAttachments("bills", newId, pendingFiles);
      if (errors.length > 0) alert(`Saved, but some files didn't upload:\n${errors.join("\n")}`);
    }
    setSaving(null);
    router.push(`/bills/${recordId ?? newId}`);
    router.refresh();
  }

  return (
    <form onSubmit={(e) => e.preventDefault()} className="space-y-6">
      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="card overflow-hidden p-0">
        <div className="grid grid-cols-1 gap-4 bg-gray-50 p-6 sm:grid-cols-[10rem_1fr]">
          <label className="label pt-1.5 text-red-500">
            Vendor Name<span> *</span>
          </label>
          <div className="max-w-sm">
            <Combobox options={vendorOptions} value={vendorId} onChange={setVendorId} placeholder="Select a Vendor" />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 p-6 sm:grid-cols-[10rem_1fr] sm:items-start">
          <label className="label pt-1.5 text-red-500">
            Bill#<span> *</span>
          </label>
          <input
            className="input max-w-xs"
            value={billNumber}
            onChange={(e) => setBillNumber(e.target.value)}
            placeholder={numberPreview ? `Auto: ${numberPreview}` : "Auto-generated if left blank"}
          />

          <label className="label pt-1.5">Order Number</label>
          <input className="input max-w-xs" value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} />

          <label className="label pt-1.5">Permit#</label>
          <input className="input max-w-xs" value={permitNumber} onChange={(e) => setPermitNumber(e.target.value)} />

          <label className="label pt-1.5 text-red-500">
            Bill Date<span> *</span>
          </label>
          <input
            className="input max-w-xs"
            type="date"
            value={billDate}
            onChange={(e) => setBillDate(e.target.value)}
          />

          <label className="label pt-1.5">Due Date</label>
          <div className="flex max-w-md gap-3">
            <input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            <div className="flex items-center gap-2 whitespace-nowrap text-sm text-ink-800">
              Payment Terms
              <select
                className="input"
                value={paymentTerms}
                onChange={(e) => {
                  setPaymentTerms(e.target.value);
                  onDueDateAuto(e.target.value, billDate);
                }}
              >
                {PAYMENT_TERMS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <label className="label pt-1.5">
            Accounts Payable <span className="text-gray-400">(?)</span>
          </label>
          <select className="input max-w-xs" value={apAccountId} onChange={(e) => setApAccountId(e.target.value)}>
            <option value="">Default (Accounts Payable)</option>
            {apAccountOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="border-t border-gray-100 p-6">
          <label className="label">Subject</label>
          <input
            className="input max-w-lg"
            maxLength={250}
            placeholder="Enter a subject within 250 characters"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-3 border-t border-gray-100 px-6 py-3 text-xs text-gray-500">
          <span className="rounded border border-gray-200 bg-gray-50 px-2 py-1">Tax Exclusive</span>
          <span className="rounded border border-gray-200 bg-gray-50 px-2 py-1">At Transaction Level</span>
        </div>

        <div className="border-t border-gray-100 p-6">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink-800">Item Table</h3>
            <button type="button" onClick={() => setRows((prev) => [...prev, newRow()])} className="btn-secondary py-1 text-xs">
              <Plus size={14} /> Add New Row
            </button>
          </div>
          <div className="overflow-x-auto rounded-md border border-gray-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="w-56 px-3 py-2">Item Details</th>
                  <th className="w-44 px-3 py-2">Account</th>
                  <th className="w-20 px-3 py-2">Qty</th>
                  <th className="w-24 px-3 py-2">Rate</th>
                  <th className="w-36 px-3 py-2">Tax</th>
                  <th className="w-40 px-3 py-2">Customer Details</th>
                  <th className="w-28 px-3 py-2">Amount</th>
                  <th className="w-10 px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {computedRows.map((row) => (
                  <tr key={row.key}>
                    <td className="px-3 py-1.5">
                      <select className="input mb-1" value={row.item_id} onChange={(e) => onItemSelect(row.key, e.target.value)}>
                        <option value="">Custom line</option>
                        {itemOptions.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      <input
                        className="input"
                        placeholder="Type or click to select an item."
                        value={row.description}
                        onChange={(e) => updateRow(row.key, { description: e.target.value })}
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <select className="input" value={row.account_id} onChange={(e) => updateRow(row.key, { account_id: e.target.value })}>
                        <option value="">Select an account</option>
                        {accountOptions.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        className="input"
                        type="number"
                        min={0}
                        step="0.01"
                        value={row.quantity}
                        onChange={(e) => updateRow(row.key, { quantity: e.target.value })}
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        className="input"
                        type="number"
                        min={0}
                        step="0.01"
                        value={row.rate}
                        onChange={(e) => updateRow(row.key, { rate: e.target.value })}
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <select className="input" value={row.tax_rate_id} onChange={(e) => updateRow(row.key, { tax_rate_id: e.target.value })}>
                        <option value="">Select a Tax</option>
                        {taxRateOptions.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label} ({o.rate}%)
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-1.5">
                      <select className="input" value={row.customer_id} onChange={(e) => updateRow(row.key, { customer_id: e.target.value })}>
                        <option value="">Select Customer</option>
                        {customerOptions.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-1.5 text-sm font-medium text-ink-800">{formatCurrency(row.amount, currency)}</td>
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

          <div className="mt-4 flex flex-col items-end gap-1.5">
            <div className="flex w-64 items-center justify-between text-sm text-gray-600">
              <span>Sub Total</span>
              <span>{formatCurrency(subtotal, currency)}</span>
            </div>
            <div className="flex w-64 items-center justify-between text-sm text-gray-600">
              <span>Tax</span>
              <span>{formatCurrency(taxTotal, currency)}</span>
            </div>
            <div className="flex w-64 items-center justify-between border-t border-gray-200 pt-1.5 text-base font-semibold text-ink-800">
              <span>Total</span>
              <span>{formatCurrency(total, currency)}</span>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-100 p-6">
          <label className="label">Notes</label>
          <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        {!recordId && (
          <div className="border-t border-gray-100 p-6">
            <AttachmentsField entityType="bills" entityId={null} pendingFiles={pendingFiles} onPendingFilesChange={setPendingFiles} label="Attach File(s) to Bill" />
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button type="button" disabled={saving !== null} onClick={() => save("draft")} className="btn-secondary">
          {saving === "draft" ? "Saving..." : "Save as Draft"}
        </button>
        <button type="button" disabled={saving !== null} onClick={() => save("open")} className="btn-primary">
          {saving === "open" ? "Saving..." : "Save as Open"}
        </button>
        <button type="button" onClick={() => router.push(recordId ? `/bills/${recordId}` : "/bills")} className="btn-secondary">
          Cancel
        </button>
      </div>
    </form>
  );
}
