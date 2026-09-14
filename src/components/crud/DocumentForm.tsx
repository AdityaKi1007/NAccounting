"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Settings2, Trash2 } from "lucide-react";
import type { DocumentConfig } from "@/lib/documents";
import type { SelectOption } from "@/lib/entities";
import { formatCurrency } from "@/lib/format";
import NumberSeriesEditModal from "@/components/settings/NumberSeriesEditModal";
import AttachmentsField from "@/components/attachments/AttachmentsField";
import { uploadPendingAttachments } from "@/lib/attachments-client";

interface ItemOption extends SelectOption {
  salesPrice: number;
  purchasePrice: number;
}

interface LineRow {
  key: string;
  item_id: string;
  description: string;
  quantity: number;
  rate: number;
  // Revenue Recognition (cfg.hasRevenueRecognition-gated, invoices only) — which rule (if any)
  // this line defers under, and the service period that rule's proration spans. Empty string
  // means untagged, same convention as item_id/project_id/unit_id above.
  revenueRecognitionRuleId: string;
  serviceStartDate: string;
  serviceEndDate: string;
}

interface NumberSeries {
  mode: "auto" | "manual";
  prefix: string;
  next_number: number;
  padding: number;
  restart_yearly: boolean;
}

interface Props {
  cfg: DocumentConfig;
  partyOptions: SelectOption[];
  /** Property Master Project/Unit options — only rendered/used for Invoices (cfg.key ===
   * "invoices"); empty arrays for every other document type sharing this form. */
  projectOptions?: SelectOption[];
  unitOptions?: SelectOption[];
  /** Revenue Recognition Rules — only rendered/used for Invoices (cfg.hasRevenueRecognition),
   * same gating as projectOptions/unitOptions above. */
  ruleOptions?: SelectOption[];
  itemOptions: ItemOption[];
  statusOptions: SelectOption[];
  currency: string;
  initial?: {
    header: Record<string, unknown>;
    lines: {
      item_id?: string | null;
      description?: string | null;
      quantity: number;
      rate: number;
      revenue_recognition_rule_id?: string | null;
      service_start_date?: string | Date | null;
      service_end_date?: string | Date | null;
    }[];
    taxPercent: number;
  } | null;
  recordId?: string;
  numberSeries?: NumberSeries | null;
  /** Human label for the document type (e.g. "Invoice", "Quote") — used in the number-series
   * "Configure" modal's title/copy when cfg.numberSeriesKey is set. */
  docLabel: string;
}

// `pg` returns a `date`-typed column as a JS `Date` object, not a string, even though every
// header value here is typed `Record<string, unknown>` (see DocumentFormPage.tsx's plain
// `queryOne` fetch — no formatting applied). The old code did
// `String(initial?.header?.[cfg.dateField] ?? "").slice(0, 10)`, and `String(dateObject)`
// produces something like "Fri Sep 11 2026 00:00:00 GMT+0000 (UTC)" — slicing the first 10
// characters of THAT silently drops the year, yielding "Fri Sep 11", which Postgres then
// rejects on save ("invalid input syntax for type date") the moment this form resubmits the
// same date field unchanged (which it always does — see onSubmit below). This is the exact
// same root cause the AR Aging report hit (see the project doc's Reports section) — a `Date`
// object being string-concatenated/truncated instead of routed through `new Date(...)` — just
// never previously tripped over here because no earlier session had edited-then-saved an
// existing Quote/Invoice/Bill/Purchase Order through this shared form. Handles a real `Date`,
// an ISO string, or nothing, and always returns a clean `YYYY-MM-DD` (or "").
function toDateInputValue(value: unknown): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

let seq = 0;
function newRow(): LineRow {
  seq += 1;
  return {
    key: `row-${seq}`,
    item_id: "",
    description: "",
    quantity: 1,
    rate: 0,
    revenueRecognitionRuleId: "",
    serviceStartDate: "",
    serviceEndDate: "",
  };
}

export default function DocumentForm({
  cfg,
  partyOptions,
  projectOptions = [],
  unitOptions = [],
  ruleOptions = [],
  itemOptions,
  statusOptions,
  currency,
  initial,
  recordId,
  numberSeries,
  docLabel,
}: Props) {
  const router = useRouter();
  const [party, setParty] = useState<string>(String(initial?.header?.[cfg.partyField] ?? ""));
  const [number, setNumber] = useState<string>(String(initial?.header?.[cfg.numberField] ?? ""));
  const [series, setSeries] = useState<NumberSeries | null | undefined>(numberSeries);
  const [showNumberModal, setShowNumberModal] = useState(false);
  const [date, setDate] = useState<string>(toDateInputValue(initial?.header?.[cfg.dateField]));
  const [secondDate, setSecondDate] = useState<string>(
    cfg.secondDateField ? toDateInputValue(initial?.header?.[cfg.secondDateField]) : ""
  );
  const [status, setStatus] = useState<string>(String(initial?.header?.status ?? statusOptions[0]?.value ?? "draft"));
  const [notes, setNotes] = useState<string>(String(initial?.header?.notes ?? ""));
  // Invoices-only (see entities.ts's salesperson field + the Sales by Salesperson report) —
  // free text with suggestions, mirroring Sales Orders' own salesperson field exactly
  // (SalesOrderForm.tsx), just surfaced generically here since Invoices use this shared form
  // rather than a bespoke one.
  const [salesperson, setSalesperson] = useState<string>(String(initial?.header?.salesperson ?? ""));
  // Invoices-only, same gating as salesperson above — optional Property Master tags.
  const [projectId, setProjectId] = useState<string>(String(initial?.header?.project_id ?? ""));
  const [unitId, setUnitId] = useState<string>(String(initial?.header?.unit_id ?? ""));
  // Invoices-only, same gating as salesperson above — external CRM system's own reference
  // number for this invoice (migrations/1776000000000_crm_reference_numbers.js).
  const [crmInvNo, setCrmInvNo] = useState<string>(String(initial?.header?.crm_inv_no ?? ""));
  const [taxPercent, setTaxPercent] = useState<number>(initial?.taxPercent ?? 5);
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
          revenueRecognitionRuleId: l.revenue_recognition_rule_id ?? "",
          serviceStartDate: toDateInputValue(l.service_start_date),
          serviceEndDate: toDateInputValue(l.service_end_date),
        };
      });
    }
    return [newRow()];
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Staged-mode files while creating — see EntityForm.tsx's identical use of this pattern
  // and AttachmentsField's own comment on the two modes.
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  const subtotal = useMemo(
    () => rows.reduce((sum, r) => sum + Number(r.quantity || 0) * Number(r.rate || 0), 0),
    [rows]
  );
  const taxTotal = Math.round(subtotal * (taxPercent / 100) * 100) / 100;
  const total = subtotal + taxTotal;

  function updateRow(key: string, patch: Partial<LineRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function onItemSelect(key: string, itemId: string) {
    const item = itemOptions.find((o) => o.value === itemId);
    updateRow(key, {
      item_id: itemId,
      description: item ? item.label : "",
      rate: item ? (cfg.key === "bills" ? item.purchasePrice : item.salesPrice) : 0,
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!party) {
      setError(`Please select a ${cfg.partyRefEntity === "customers" ? "customer" : "vendor"}.`);
      return;
    }
    const validLines = rows.filter((r) => r.description.trim() && Number(r.quantity) > 0);
    if (validLines.length === 0) {
      setError("Add at least one line item.");
      return;
    }
    setSaving(true);
    const url = recordId ? `/api/documents/${cfg.entityKey}/${recordId}` : `/api/documents/${cfg.entityKey}`;
    const method = recordId ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        header: {
          [cfg.numberField]: number,
          [cfg.partyField]: party,
          // Always send a real value (never `undefined`) for these two — JSON.stringify drops
          // undefined-valued keys entirely, and the update API treats a missing key as "leave
          // this field alone" (see updateDocument in src/lib/documents-api.ts) rather than
          // "clear it", so an omitted key here would silently stop this save from being able
          // to clear the due/expiry/shipment date once it's been set.
          [cfg.dateField]: date || null,
          ...(cfg.secondDateField ? { [cfg.secondDateField]: secondDate || null } : {}),
          status,
          notes,
          ...(cfg.key === "invoices"
            ? {
                salesperson: salesperson || null,
                project_id: projectId || null,
                unit_id: unitId || null,
                crm_inv_no: crmInvNo || null,
              }
            : {}),
        },
        lines: validLines.map((r) => ({
          item_id: r.item_id || null,
          description: r.description,
          quantity: Number(r.quantity),
          rate: Number(r.rate),
          ...(cfg.hasRevenueRecognition
            ? {
                revenue_recognition_rule_id: r.revenueRecognitionRuleId || null,
                service_start_date: r.serviceStartDate || null,
                service_end_date: r.serviceEndDate || null,
              }
            : {}),
        })),
        taxPercent,
      }),
    });
    if (!res.ok) {
      setSaving(false);
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === "string" ? data.error : "Something went wrong.");
      return;
    }
    const data = await res.json();
    if (!recordId && pendingFiles.length > 0 && data.id) {
      // See EntityForm.tsx's identical comment: the record is already saved by this point,
      // so an attachment failure surfaces via alert() rather than blocking the redirect.
      const errors = await uploadPendingAttachments(cfg.entityKey, data.id, pendingFiles);
      if (errors.length > 0) alert(`Saved, but some files didn't upload:\n${errors.join("\n")}`);
    }
    setSaving(false);
    router.push(`/${cfg.entityKey}`);
    router.refresh();
  }

  const partyLabel = cfg.partyRefEntity === "customers" ? "Customer" : "Vendor";

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label">
            {partyLabel} <span className="text-red-500">*</span>
          </label>
          <select className="input" value={party} onChange={(e) => setParty(e.target.value)}>
            <option value="">Select {partyLabel}</option>
            {partyOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div className="flex items-center justify-between">
            <label className="label">Number</label>
            {cfg.numberSeriesKey && (
              <button
                type="button"
                onClick={() => setShowNumberModal(true)}
                className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
                title={`Configure ${docLabel.toLowerCase()} number preferences`}
              >
                <Settings2 size={12} /> Configure
              </button>
            )}
          </div>
          <input
            className="input"
            value={number}
            placeholder={
              cfg.numberSeriesKey && series?.mode === "auto" && !recordId
                ? `Auto: ${series.prefix}${String(series.next_number).padStart(series.padding, "0")}`
                : "Auto-generated if left blank"
            }
            onChange={(e) => setNumber(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Date</label>
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        {cfg.secondDateField && (
          <div>
            <label className="label">{cfg.secondDateLabel}</label>
            <input
              className="input"
              type="date"
              value={secondDate}
              onChange={(e) => setSecondDate(e.target.value)}
            />
          </div>
        )}
        <div>
          <label className="label">Status</label>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            {statusOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="label mb-0">Line Items</label>
          <button
            type="button"
            onClick={() => setRows((prev) => [...prev, newRow()])}
            className="btn-secondary py-1 text-xs"
          >
            <Plus size={14} /> Add Row
          </button>
        </div>
        <div className="overflow-x-auto rounded-md border border-gray-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="w-56 px-3 py-2">Item</th>
                <th className="px-3 py-2">Description</th>
                <th className="w-24 px-3 py-2">Qty</th>
                <th className="w-28 px-3 py-2">Rate</th>
                {cfg.hasRevenueRecognition && (
                  <>
                    <th className="w-44 px-3 py-2">Recognition Rule</th>
                    <th className="w-32 px-3 py-2">Service Start</th>
                    <th className="w-32 px-3 py-2">Service End</th>
                  </>
                )}
                <th className="w-28 px-3 py-2">Amount</th>
                <th className="w-10 px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row) => (
                <tr key={row.key}>
                  <td className="px-3 py-1.5">
                    <select
                      className="input"
                      value={row.item_id}
                      onChange={(e) => onItemSelect(row.key, e.target.value)}
                    >
                      <option value="">Custom line</option>
                      {itemOptions.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      className="input"
                      value={row.description}
                      onChange={(e) => updateRow(row.key, { description: e.target.value })}
                      placeholder="Description"
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      className="input"
                      type="number"
                      min={0}
                      step="0.01"
                      value={row.quantity}
                      onChange={(e) => updateRow(row.key, { quantity: parseFloat(e.target.value) || 0 })}
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      className="input"
                      type="number"
                      min={0}
                      step="0.01"
                      value={row.rate}
                      onChange={(e) => updateRow(row.key, { rate: parseFloat(e.target.value) || 0 })}
                    />
                  </td>
                  {cfg.hasRevenueRecognition && (
                    <>
                      <td className="px-3 py-1.5">
                        <select
                          className="input"
                          value={row.revenueRecognitionRuleId}
                          onChange={(e) => updateRow(row.key, { revenueRecognitionRuleId: e.target.value })}
                        >
                          <option value="">Immediate (no deferral)</option>
                          {ruleOptions.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          className="input"
                          type="date"
                          value={row.serviceStartDate}
                          disabled={!row.revenueRecognitionRuleId}
                          onChange={(e) => updateRow(row.key, { serviceStartDate: e.target.value })}
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          className="input"
                          type="date"
                          value={row.serviceEndDate}
                          disabled={!row.revenueRecognitionRuleId}
                          onChange={(e) => updateRow(row.key, { serviceEndDate: e.target.value })}
                        />
                      </td>
                    </>
                  )}
                  <td className="px-3 py-1.5 text-sm text-ink-800">
                    {formatCurrency(row.quantity * row.rate, currency)}
                  </td>
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

      <div className="flex flex-col items-end gap-1.5">
        <div className="flex w-64 items-center justify-between text-sm text-gray-600">
          <span>Subtotal</span>
          <span>{formatCurrency(subtotal, currency)}</span>
        </div>
        <div className="flex w-64 items-center justify-between text-sm text-gray-600">
          <span className="flex items-center gap-1.5">
            Tax
            <input
              className="w-14 rounded border border-gray-300 px-1.5 py-0.5 text-right text-xs"
              type="number"
              min={0}
              step="0.01"
              value={taxPercent}
              onChange={(e) => setTaxPercent(parseFloat(e.target.value) || 0)}
            />
            %
          </span>
          <span>{formatCurrency(taxTotal, currency)}</span>
        </div>
        <div className="flex w-64 items-center justify-between border-t border-gray-200 pt-1.5 text-base font-semibold text-ink-800">
          <span>Total</span>
          <span>{formatCurrency(total, currency)}</span>
        </div>
      </div>

      {cfg.key === "invoices" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <div>
            <label className="label">Salesperson</label>
            <input
              className="input"
              list="invoice-salespersons"
              value={salesperson}
              onChange={(e) => setSalesperson(e.target.value)}
              placeholder="Select or add salesperson"
            />
            <datalist id="invoice-salespersons" />
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
          <div>
            <label className="label">CRM Inv No</label>
            <input
              className="input"
              value={crmInvNo}
              onChange={(e) => setCrmInvNo(e.target.value)}
              placeholder="Reference number from your CRM"
            />
          </div>
        </div>
      )}

      <div>
        <label className="label">Notes</label>
        <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      {cfg.allowAttachments && (
        <AttachmentsField
          entityType={cfg.entityKey}
          entityId={recordId ?? null}
          pendingFiles={pendingFiles}
          onPendingFilesChange={setPendingFiles}
        />
      )}

      <div className="flex items-center gap-2 border-t border-gray-100 pt-4">
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? "Saving..." : recordId ? "Save Changes" : "Save"}
        </button>
        <button type="button" onClick={() => router.push(`/${cfg.entityKey}`)} className="btn-secondary">
          Cancel
        </button>
      </div>

      {cfg.numberSeriesKey && (
        <NumberSeriesEditModal
          open={showNumberModal}
          onClose={() => setShowNumberModal(false)}
          onSaved={(updated) => setSeries(updated)}
          entityKey={cfg.numberSeriesKey}
          label={docLabel}
        />
      )}
    </form>
  );
}
