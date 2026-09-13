"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import AttachmentsField from "@/components/attachments/AttachmentsField";
import { uploadPendingAttachments } from "@/lib/attachments-client";

interface Option {
  value: string;
  label: string;
}

interface ItemOption extends Option {
  salesPrice: number;
}

interface LineRow {
  key: string;
  item_id: string;
  description: string;
  quantity: number;
  rate: number;
  discount_percent: number;
}

interface Props {
  customerOptions: Option[];
  itemOptions: ItemOption[];
  paymentTermOptions: string[];
  defaultPaymentTerm: string;
  /** Optional Property Master tags — same as invoices' own (see DocumentForm.tsx). */
  projectOptions: Option[];
  unitOptions: Option[];
  currency: string;
  initial?: {
    header: Record<string, unknown>;
    lines: { item_id: string | null; description: string | null; quantity: number; rate: number; discount_percent: number }[];
  } | null;
  recordId?: string;
  /** The next auto-number from the org's number series, shown pre-filled (still editable,
   * same as Zoho) — only set for a new record; editing keeps the sales order's own number. */
  numberPreview?: string;
}

let seq = 0;
function newRow(): LineRow {
  seq += 1;
  return { key: `row-${seq}`, item_id: "", description: "", quantity: 1, rate: 0, discount_percent: 0 };
}

function rowAmount(row: LineRow) {
  const gross = Number(row.quantity || 0) * Number(row.rate || 0);
  const discount = Math.min(Math.max(Number(row.discount_percent || 0), 0), 100);
  return Math.round(gross * (1 - discount / 100) * 100) / 100;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// `pg` returns a `date`-typed column (order_date, shipment_date) as a JS `Date` object, not a
// string, even though `initial.header` is typed `Record<string, unknown>`. The old code did
// `String(initial?.header?.order_date ?? todayStr()).slice(0, 10)`, and `String(dateObject)`
// produces something like "Sat Sep 12 2026 00:00:00 GMT+0000 (UTC)" — slicing the first 10
// characters of THAT drops the year, yielding "Sat Sep 12", which Postgres then rejects on save
// ("invalid input syntax for type date") the moment this form resubmits the date unchanged
// (which it always does on edit). Same root cause already fixed in the generic DocumentForm.tsx
// (see its own toDateInputValue) — SalesOrderForm is a separate bespoke component, so it needed
// the same fix here. Handles a real `Date`, an ISO string, or nothing/"" and always returns a
// clean `YYYY-MM-DD` (or "").
function toDateInputValue(value: unknown): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export default function SalesOrderForm({
  customerOptions,
  itemOptions,
  paymentTermOptions,
  defaultPaymentTerm,
  projectOptions,
  unitOptions,
  currency,
  initial,
  recordId,
  numberPreview,
}: Props) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState<string>(String(initial?.header?.customer_id ?? ""));
  // On create, leave this blank rather than pre-filling numberPreview: createDocument() only
  // claims the next number from the sequence when the submitted so_number is empty, so a
  // pre-filled preview value would get resubmitted as a literal string on every save and the
  // series counter would never advance — every sales order would end up numbered the same
  // (the bug this comment replaced). numberPreview is shown as the input's placeholder
  // instead, exactly like the generic DocumentForm does for invoices/quotes/bills.
  const [number, setNumber] = useState<string>(String(initial?.header?.so_number ?? ""));
  const [referenceNumber, setReferenceNumber] = useState<string>(String(initial?.header?.reference_number ?? ""));
  const [orderDate, setOrderDate] = useState<string>(
    initial?.header?.order_date ? toDateInputValue(initial.header.order_date) : todayStr(),
  );
  const [shipmentDate, setShipmentDate] = useState<string>(toDateInputValue(initial?.header?.shipment_date));
  const [paymentTerms, setPaymentTerms] = useState<string>(String(initial?.header?.payment_terms ?? defaultPaymentTerm));
  const [deliveryMethod, setDeliveryMethod] = useState<string>(String(initial?.header?.delivery_method ?? ""));
  const [salesperson, setSalesperson] = useState<string>(String(initial?.header?.salesperson ?? ""));
  const [projectId, setProjectId] = useState<string>(String(initial?.header?.project_id ?? ""));
  const [unitId, setUnitId] = useState<string>(String(initial?.header?.unit_id ?? ""));
  const [notes, setNotes] = useState<string>(String(initial?.header?.notes ?? ""));
  const [termsConditions, setTermsConditions] = useState<string>(String(initial?.header?.terms_conditions ?? ""));
  const [crmSoNo, setCrmSoNo] = useState<string>(String(initial?.header?.crm_so_no ?? ""));
  const [rows, setRows] = useState<LineRow[]>(() => {
    if (initial?.lines?.length) {
      return initial.lines.map((l) => {
        seq += 1;
        return {
          key: `row-${seq}`,
          item_id: l.item_id ?? "",
          description: l.description ?? "",
          quantity: Number(l.quantity),
          rate: Number(l.rate),
          discount_percent: Number(l.discount_percent ?? 0),
        };
      });
    }
    return [newRow()];
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<"draft" | "send" | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  const subtotal = useMemo(() => rows.reduce((sum, r) => sum + rowAmount(r), 0), [rows]);

  function updateRow(key: string, patch: Partial<LineRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function onItemSelect(key: string, itemId: string) {
    const item = itemOptions.find((o) => o.value === itemId);
    updateRow(key, { item_id: itemId, description: item ? item.label : "", rate: item ? item.salesPrice : 0 });
  }

  async function onSubmit(status: "draft" | "confirmed") {
    setError(null);
    if (!customerId) {
      setError("Please select a customer.");
      return;
    }
    const validLines = rows.filter((r) => r.description.trim() && Number(r.quantity) > 0);
    if (validLines.length === 0) {
      setError("Add at least one line item.");
      return;
    }
    setSaving(status === "draft" ? "draft" : "send");
    const url = recordId ? `/api/documents/sales-orders/${recordId}` : `/api/documents/sales-orders`;
    const method = recordId ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        header: {
          so_number: number,
          customer_id: customerId,
          reference_number: referenceNumber || null,
          order_date: orderDate || null,
          shipment_date: shipmentDate || null,
          payment_terms: paymentTerms || null,
          delivery_method: deliveryMethod || null,
          salesperson: salesperson || null,
          project_id: projectId || null,
          unit_id: unitId || null,
          status,
          notes,
          terms_conditions: termsConditions || null,
          crm_so_no: crmSoNo || null,
        },
        lines: validLines.map((r) => ({
          item_id: r.item_id || null,
          description: r.description,
          quantity: Number(r.quantity),
          rate: Number(r.rate),
          discount_percent: Number(r.discount_percent) || 0,
        })),
        taxPercent: 0,
      }),
    });
    if (!res.ok) {
      setSaving(null);
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === "string" ? data.error : "Something went wrong.");
      return;
    }
    const data = await res.json();
    if (!recordId && pendingFiles.length > 0 && data.id) {
      // Same pattern as DocumentForm.tsx/CustomerForm.tsx: the sales order is already
      // saved, so an attachment failure surfaces via alert() rather than blocking the redirect.
      const errors = await uploadPendingAttachments("sales-orders", data.id, pendingFiles);
      if (errors.length > 0) alert(`Saved, but some files didn't upload:\n${errors.join("\n")}`);
    }
    setSaving(null);
    router.push(`/sales-orders`);
    router.refresh();
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit("confirmed");
      }}
      className="space-y-6"
    >
      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
        <div>
          <label className="label">
            Customer Name <span className="text-red-500">*</span>
          </label>
          <div className="flex items-stretch gap-2">
            <select className="input flex-1" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">Select or add a customer</option>
              {customerOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <span className="flex items-center justify-center rounded-md bg-brand-600 px-3 text-white" title="Search customers">
              <Search size={14} />
            </span>
          </div>
        </div>
        <div>
          <label className="label">
            Sales Order# <span className="text-red-500">*</span>
          </label>
          <input
            className="input"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            placeholder={numberPreview && !recordId ? `Auto: ${numberPreview}` : "Auto-generated if left blank"}
          />
        </div>

        <div>
          <label className="label">Reference#</label>
          <input className="input" value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} />
        </div>
        <div>
          <label className="label">CRM SO No</label>
          <input
            className="input"
            value={crmSoNo}
            onChange={(e) => setCrmSoNo(e.target.value)}
            placeholder="Reference number from your CRM"
          />
        </div>

        <div>
          <label className="label">
            Sales Order Date <span className="text-red-500">*</span>
          </label>
          <input className="input" type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
        </div>
        <div />

        <div>
          <label className="label">Expected Shipment Date</label>
          <input className="input" type="date" value={shipmentDate} onChange={(e) => setShipmentDate(e.target.value)} />
        </div>
        <div />

        <div>
          <label className="label">Payment Terms</label>
          <select className="input" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)}>
            {paymentTermOptions.length === 0 && <option value={paymentTerms}>{paymentTerms}</option>}
            {paymentTermOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <div />
      </div>

      <div className="border-t border-gray-100 pt-4">
        <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
          <div>
            <label className="label">Delivery Method</label>
            <input
              className="input"
              list="delivery-methods"
              value={deliveryMethod}
              onChange={(e) => setDeliveryMethod(e.target.value)}
              placeholder="Select a delivery method or type to add"
            />
            <datalist id="delivery-methods">
              <option value="Courier" />
              <option value="Pickup" />
              <option value="Own Fleet" />
            </datalist>
          </div>
          <div />
        </div>

        {/* Property Master tags — same fields/layout as Invoices' own Salesperson/Project/Unit
            row (DocumentForm.tsx, cfg.key === "invoices"). */}
        <div className="mt-4 grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-3">
          <div>
            <label className="label">Salesperson</label>
            <input
              className="input"
              list="salespersons"
              value={salesperson}
              onChange={(e) => setSalesperson(e.target.value)}
              placeholder="Select or add salesperson"
            />
            <datalist id="salespersons" />
          </div>
          <div>
            <label className="label">Project</label>
            <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">Select Project</option>
              {projectOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Unit</label>
            <select className="input" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
              <option value="">Select Unit</option>
              {unitOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
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
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="w-64 px-3 py-2">Item Details</th>
                <th className="w-24 px-3 py-2 text-right">Quantity</th>
                <th className="w-28 px-3 py-2 text-right">Rate</th>
                <th className="w-24 px-3 py-2 text-right">Discount</th>
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
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-1">
                      <input
                        className="input text-right"
                        type="number"
                        min={0}
                        max={100}
                        step="0.01"
                        value={row.discount_percent}
                        onChange={(e) => updateRow(row.key, { discount_percent: parseFloat(e.target.value) || 0 })}
                      />
                      <span className="text-xs text-gray-400">%</span>
                    </div>
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
          <label className="label">Customer Notes</label>
          <textarea
            className="input"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Enter any notes to be displayed in your transaction"
          />
        </div>
        <div className="flex w-56 flex-col items-end justify-start gap-1.5 pt-6">
          <div className="flex w-full items-center justify-between text-sm text-gray-600">
            <span>Sub Total</span>
            <span>{formatCurrency(subtotal, currency)}</span>
          </div>
          <div className="flex w-full items-center justify-between border-t border-gray-200 pt-1.5 text-base font-semibold text-ink-800">
            <span>Total ( {currency} )</span>
            <span>{formatCurrency(subtotal, currency)}</span>
          </div>
        </div>
      </div>

      <div>
        <label className="label">Terms &amp; Conditions</label>
        <textarea
          className="input"
          rows={3}
          value={termsConditions}
          onChange={(e) => setTermsConditions(e.target.value)}
          placeholder="Enter the terms and conditions of your business to be displayed in your transaction"
        />
      </div>

      <AttachmentsField
        entityType="sales-orders"
        entityId={recordId ?? null}
        pendingFiles={pendingFiles}
        onPendingFilesChange={setPendingFiles}
        label="Attach File(s) to Sales Order"
      />

      <p className="text-xs italic text-gray-400">
        Additional Fields: Add custom fields to your sales orders by going to Settings → Sales → Sales Orders → Field
        Customization.
      </p>

      <div className="flex items-center gap-2 border-t border-gray-100 pt-4">
        <button type="button" onClick={() => onSubmit("draft")} disabled={saving !== null} className="btn-secondary">
          {saving === "draft" ? "Saving..." : "Save as Draft"}
        </button>
        <button type="submit" disabled={saving !== null} className="btn-primary">
          {saving === "send" ? "Saving..." : "Save and Send"}
        </button>
        <button type="button" onClick={() => router.push("/sales-orders")} className="btn-secondary">
          Cancel
        </button>
      </div>
    </form>
  );
}
