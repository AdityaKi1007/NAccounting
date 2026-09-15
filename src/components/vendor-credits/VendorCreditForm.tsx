"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import Combobox, { type ComboboxOption } from "@/components/ui/Combobox";
import { formatCurrency } from "@/lib/format";
import AttachmentsField from "@/components/attachments/AttachmentsField";
import { uploadPendingAttachments } from "@/lib/attachments-client";

export type VendorCreditOption = ComboboxOption;
export interface VendorCreditItemOption extends VendorCreditOption {
  purchasePrice: number;
}
interface TaxRateOption extends VendorCreditOption {
  rate: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function toDateInput(v: unknown) {
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
  vendorOptions: VendorCreditOption[];
  accountOptions: VendorCreditOption[];
  apAccountOptions: VendorCreditOption[];
  itemOptions: VendorCreditItemOption[];
  taxRateOptions: TaxRateOption[];
  customerOptions: VendorCreditOption[];
}

/** Bespoke "New Vendor Credit" form matching the Zoho Books reference screenshot — this
 * document never had line items or its own create form before this build (it was a plain
 * flat total+reason record — see entities.ts's own comment). Structurally identical to
 * BillForm.tsx (same per-line Account/Tax/Customer Details columns, for the same "proper
 * accounting" reason — see vendor-credits-api.ts), plus the Discount% the screenshot adds
 * at the summary level. Not tied to any specific bill at creation, matching the screenshot
 * (no "Against Bill" field) — see auto-journal.ts's syncVendorCreditJournal for the scope
 * decision that follows from that: this posts a correct GL entry for the credit itself, but
 * doesn't reduce any one bill's balance_due (Zoho's separate "Apply Credits" action). */
export default function VendorCreditForm({
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
  const [creditNoteNumber, setCreditNoteNumber] = useState(String(h.credit_note_number ?? ""));
  const [orderNumber, setOrderNumber] = useState(String(h.order_number ?? ""));
  const [creditDate, setCreditDate] = useState(toDateInput(h.credit_date) || new Date().toISOString().slice(0, 10));
  const [apAccountId, setApAccountId] = useState(String(h.accounts_payable_account_id ?? apAccountOptions[0]?.value ?? ""));
  const [subject, setSubject] = useState(String(h.subject ?? ""));
  const [discountPercent, setDiscountPercent] = useState(String(h.discount_percent ?? "0"));
  const [reason, setReason] = useState(String(h.reason ?? ""));

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
  const [saving, setSaving] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  function updateRow(key: string, patch: Partial<LineRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function onItemSelect(key: string, itemId: string) {
    const item = itemOptions.find((o) => o.value === itemId);
    updateRow(key, { item_id: itemId, description: item ? item.label : "", rate: item ? String(item.purchasePrice) : "0" });
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
  const discountAmount = round2((subtotal * (parseFloat(discountPercent) || 0)) / 100);
  const total = round2(subtotal - discountAmount + taxTotal);

  async function save() {
    setError(null);
    if (!vendorId) return setError("Vendor Name is required.");
    if (!creditDate) return setError("Vendor Credit Date is required.");
    const validLines = rows.filter((r) => r.description.trim() && Number(r.quantity) > 0);
    if (validLines.length === 0) return setError("Add at least one line item.");
    if (validLines.some((r) => !r.account_id)) return setError("Select an Account for every line item.");

    setSaving(true);
    const url = recordId ? `/api/vendor-credits/${recordId}` : `/api/vendor-credits`;
    const method = recordId ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        credit_note_number: creditNoteNumber.trim() || undefined,
        vendor_id: vendorId,
        credit_date: creditDate,
        order_number: orderNumber || null,
        subject: subject || null,
        accounts_payable_account_id: apAccountId || null,
        discount_percent: parseFloat(discountPercent) || 0,
        reason: reason || null,
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
      setSaving(false);
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === "string" ? data.error : "Something went wrong.");
      return;
    }
    const data = await res.json();
    const newId = data.id as string | undefined;
    if (!recordId && newId && pendingFiles.length > 0) {
      const errors = await uploadPendingAttachments("vendor-credits", newId, pendingFiles);
      if (errors.length > 0) alert(`Saved, but some files didn't upload:\n${errors.join("\n")}`);
    }
    setSaving(false);
    router.push(`/vendor-credits/${recordId ?? newId}`);
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
            Credit Note#<span> *</span>
          </label>
          <input
            className="input max-w-xs"
            value={creditNoteNumber}
            onChange={(e) => setCreditNoteNumber(e.target.value)}
            placeholder={numberPreview ? `Auto: ${numberPreview}` : "Auto-generated if left blank"}
          />

          <label className="label pt-1.5">Order Number</label>
          <input className="input max-w-xs" value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} />

          <label className="label pt-1.5 text-red-500">
            Vendor Credit Date<span> *</span>
          </label>
          <input className="input max-w-xs" type="date" value={creditDate} onChange={(e) => setCreditDate(e.target.value)} />

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
            <div className="flex gap-2">
              <button type="button" onClick={() => setRows((prev) => [...prev, newRow()])} className="btn-secondary py-1 text-xs">
                <Plus size={14} /> Add New Row
              </button>
            </div>
          </div>
          <div className="overflow-x-auto rounded-md border border-gray-200">
            {/* table-fixed — same fix as BillForm.tsx's identical item table (this table is a
               near-exact copy of it): without it, table-layout: auto lets w-full squish the
               Account/Qty/Customer Details columns instead of triggering the overflow-x-auto
               scroll above. See known-issues-local-env-addendum-line-items-table-layout-
               2026-09-14.md and its 2026-09-15 Bills/Vendor Credits follow-up. */}
            <table className="w-full table-fixed text-left text-sm">
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
              <span className="flex items-center gap-1.5">
                Discount
                <input
                  className="w-14 rounded border border-gray-300 px-1.5 py-0.5 text-right text-xs"
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={discountPercent}
                  onChange={(e) => setDiscountPercent(e.target.value)}
                />
                %
              </span>
              <span>-{formatCurrency(discountAmount, currency)}</span>
            </div>
            {taxTotal > 0 && (
              <div className="flex w-64 items-center justify-between text-sm text-gray-600">
                <span>Tax</span>
                <span>{formatCurrency(taxTotal, currency)}</span>
              </div>
            )}
            <div className="flex w-64 items-center justify-between border-t border-gray-200 pt-1.5 text-base font-semibold text-ink-800">
              <span>Total</span>
              <span>{formatCurrency(total, currency)}</span>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-100 p-6">
          <label className="label">Notes</label>
          <textarea className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for this vendor credit" />
        </div>

        {!recordId && (
          <div className="border-t border-gray-100 p-6">
            <AttachmentsField
              entityType="vendor-credits"
              entityId={null}
              pendingFiles={pendingFiles}
              onPendingFilesChange={setPendingFiles}
              label="Attach File(s) to Vendor Credits"
            />
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button type="button" disabled={saving} onClick={save} className="btn-primary">
          {saving ? "Saving..." : "Save"}
        </button>
        <button type="button" onClick={() => router.push(recordId ? `/vendor-credits/${recordId}` : "/vendor-credits")} className="btn-secondary">
          Cancel
        </button>
      </div>
    </form>
  );
}
