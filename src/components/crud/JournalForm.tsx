"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, AlertTriangle, CheckCircle2, GripVertical, Info } from "lucide-react";
import type { SelectOption } from "@/lib/entities";
import { formatCurrency, toDateInputValue } from "@/lib/format";

interface LineRow {
  key: string;
  account_id: string;
  description: string;
  debit: number;
  credit: number;
  contact_type: string; // "" | "customer" | "vendor"
  contact_id: string;
}

interface Props {
  accountOptions: SelectOption[];
  contactOptions: { customers: SelectOption[]; vendors: SelectOption[] };
  currencyOptions: SelectOption[];
  baseCurrency: string;
  initial?: {
    header: Record<string, unknown>;
    lines: {
      account_id: string;
      description: string | null;
      debit: number;
      credit: number;
      contact_type?: string | null;
      contact_id?: string | null;
    }[];
  } | null;
  recordId?: string;
}

export const REPORTING_METHODS: { value: string; label: string }[] = [
  { value: "accrual_and_cash", label: "Accrual and Cash" },
  { value: "accrual_only", label: "Accrual Only" },
  { value: "cash_only", label: "Cash Only" },
];

let seq = 0;
function newRow(): LineRow {
  seq += 1;
  return { key: `jline-${seq}`, account_id: "", description: "", debit: 0, credit: 0, contact_type: "", contact_id: "" };
}

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

export default function JournalForm({ accountOptions, contactOptions, currencyOptions, baseCurrency, initial, recordId }: Props) {
  const router = useRouter();
  const [number, setNumber] = useState<string>(String(initial?.header?.journal_number ?? ""));
  const [date, setDate] = useState<string>(() =>
    initial?.header?.journal_date ? toDateInputValue(initial.header.journal_date) : todayInput()
  );
  const [reverseDate, setReverseDate] = useState<string>(() =>
    initial?.header?.reverse_journal_date ? toDateInputValue(initial.header.reverse_journal_date) : ""
  );
  const [reverseOnlyOnDate, setReverseOnlyOnDate] = useState<boolean>(Boolean(initial?.header?.reverse_only_on_date));
  const [reference, setReference] = useState<string>(String(initial?.header?.reference_number ?? ""));
  const [notes, setNotes] = useState<string>(String(initial?.header?.notes ?? ""));
  const [reportingMethod, setReportingMethod] = useState<string>(String(initial?.header?.reporting_method ?? "accrual_and_cash"));
  const [currencyCode, setCurrencyCode] = useState<string>(String(initial?.header?.currency_code ?? baseCurrency));
  const isReversal = Boolean(initial?.header?.reversed_journal_id);
  const [rows, setRows] = useState<LineRow[]>(() => {
    if (initial?.lines?.length) {
      return initial.lines.map((l) => {
        seq += 1;
        return {
          key: `jline-${seq}`,
          account_id: l.account_id,
          description: l.description ?? "",
          debit: Number(l.debit),
          credit: Number(l.credit),
          contact_type: l.contact_type ?? "",
          contact_id: l.contact_id ?? "",
        };
      });
    }
    return [newRow(), newRow()];
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<"draft" | "published" | null>(null);

  const totalDebit = useMemo(() => rows.reduce((s, r) => s + Number(r.debit || 0), 0), [rows]);
  const totalCredit = useMemo(() => rows.reduce((s, r) => s + Number(r.credit || 0), 0), [rows]);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.005 && totalDebit > 0;

  function updateRow(key: string, patch: Partial<LineRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function onReverseDateChange(value: string) {
    setReverseDate(value);
    if (!value) setReverseOnlyOnDate(false);
  }

  async function submit(status: "draft" | "published") {
    setError(null);
    const validLines = rows.filter((r) => r.account_id && (Number(r.debit) > 0 || Number(r.credit) > 0));
    if (!date) {
      setError("Date is required.");
      return;
    }
    if (!notes.trim()) {
      setError("Notes is required.");
      return;
    }
    if (validLines.length === 0) {
      setError("Add at least one journal line with an account and a debit or credit amount.");
      return;
    }
    if (status === "published" && !balanced) {
      setError("Total debits must equal total credits before publishing. Save as Draft instead, or fix the amounts.");
      return;
    }
    if (reverseDate && reverseDate < date) {
      setError("Reverse Journal Date must be on or after the Date.");
      return;
    }
    setSaving(status);
    const url = recordId ? `/api/journals/${recordId}` : `/api/journals`;
    const method = recordId ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        header: {
          journal_number: number,
          journal_date: date || undefined,
          reference_number: reference,
          status,
          notes,
          reverse_journal_date: reverseDate || null,
          reverse_only_on_date: reverseOnlyOnDate,
          reporting_method: reportingMethod,
          currency_code: currencyCode,
        },
        lines: validLines.map((r) => ({
          account_id: r.account_id,
          description: r.description,
          debit: Number(r.debit) || 0,
          credit: Number(r.credit) || 0,
          contact_type: r.contact_type || null,
          contact_id: r.contact_id || null,
        })),
      }),
    });
    setSaving(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === "string" ? data.error : "Something went wrong.");
      return;
    }
    router.push("/manual-journals");
    router.refresh();
  }

  return (
    <form onSubmit={(e) => e.preventDefault()} className="space-y-6">
      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {isReversal && (
        <div className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <Info size={16} className="mt-0.5 shrink-0" />
          This journal was auto-generated to reverse another journal (see Reference # below).
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-x-10">
        <div>
          <label className="label">
            Date <span className="text-red-500">*</span>
          </label>
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div />

        <div>
          <label className="label">Reverse Journal Date</label>
          <input className="input" type="date" value={reverseDate} onChange={(e) => onReverseDateChange(e.target.value)} min={date} />
          <label className="mt-2 flex items-center gap-2 text-xs text-ink-700">
            <input
              type="checkbox"
              checked={reverseOnlyOnDate}
              disabled={!reverseDate}
              onChange={(e) => setReverseOnlyOnDate(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-gray-300 text-brand-600 focus:ring-brand-500 disabled:opacity-40"
            />
            Publish reverse journal only on the reverse journal date
          </label>
          {reverseDate && (
            <p className="mt-1 text-xs text-gray-400">
              {reverseOnlyOnDate
                ? `A mirror-image reversing journal will be created as a Draft and auto-published on ${reverseDate}.`
                : `A mirror-image reversing journal will be published now, dated ${reverseDate}.`}
            </p>
          )}
        </div>
        <div />

        <div>
          <label className="label">
            Journal# <span className="text-red-500">*</span>
          </label>
          <input
            className="input"
            value={number}
            placeholder="Auto-generated if left blank"
            onChange={(e) => setNumber(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Reference#</label>
          <input className="input" value={reference} onChange={(e) => setReference(e.target.value)} />
        </div>

        <div className="sm:col-span-2">
          <label className="label">
            Notes <span className="text-red-500">*</span>
          </label>
          <textarea
            className="input"
            rows={3}
            maxLength={500}
            placeholder="Max. 500 characters"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <p className="mt-1 text-right text-xs text-gray-400">{notes.length}/500</p>
        </div>

        <div>
          <label className="label mb-2 flex items-center gap-1">
            Reporting Method <Info size={13} className="text-gray-400" />
          </label>
          <div className="flex flex-wrap items-center gap-5">
            {REPORTING_METHODS.map((opt) => (
              <label key={opt.value} className="flex items-center gap-2 text-sm text-ink-800">
                <input
                  type="radio"
                  name="reporting_method"
                  checked={reportingMethod === opt.value}
                  onChange={() => setReportingMethod(opt.value)}
                  className="h-4 w-4 border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                {opt.label}
              </label>
            ))}
          </div>
        </div>
        <div>
          <label className="label">Currency</label>
          <select className="input max-w-xs" value={currencyCode} onChange={(e) => setCurrencyCode(e.target.value)}>
            {currencyOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <div className="overflow-x-auto rounded-md border border-gray-200">
          {/* table-fixed — same fix as BillForm.tsx/VendorCreditForm.tsx's item tables and
             DocumentForm.tsx before them: without it, table-layout: auto lets w-full squish
             every column instead of triggering the overflow-x-auto scroll above. The
             Description column had no width class at all (relying on leftover space, which
             table-fixed doesn't allocate) so it now gets an explicit w-64, same reasoning as
             DocumentForm.tsx's own Description column fix. See known-issues-local-env-
             addendum-line-items-table-layout-2026-09-14.md and its 2026-09-15 follow-up. */}
          <table className="w-full table-fixed text-left text-sm">
            <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="w-6 px-1 py-2" />
                <th className="w-56 px-3 py-2">Account</th>
                <th className="w-64 px-3 py-2">Description</th>
                <th className="w-48 px-3 py-2">Contact ({currencyCode})</th>
                <th className="w-28 px-3 py-2">Debits</th>
                <th className="w-28 px-3 py-2">Credits</th>
                <th className="w-10 px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row) => (
                <tr key={row.key}>
                  <td className="px-1 py-1.5 text-gray-300">
                    <GripVertical size={14} />
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
                      placeholder="Description"
                      value={row.description}
                      onChange={(e) => updateRow(row.key, { description: e.target.value })}
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <select
                      className="input"
                      value={row.contact_type && row.contact_id ? `${row.contact_type}:${row.contact_id}` : ""}
                      onChange={(e) => {
                        const [type, id] = e.target.value ? e.target.value.split(":") : ["", ""];
                        updateRow(row.key, { contact_type: type, contact_id: id });
                      }}
                    >
                      <option value="">Select Contact</option>
                      {contactOptions.customers.length > 0 && (
                        <optgroup label="Customers">
                          {contactOptions.customers.map((o) => (
                            <option key={`c-${o.value}`} value={`customer:${o.value}`}>
                              {o.label}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {contactOptions.vendors.length > 0 && (
                        <optgroup label="Vendors">
                          {contactOptions.vendors.map((o) => (
                            <option key={`v-${o.value}`} value={`vendor:${o.value}`}>
                              {o.label}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      className="input"
                      type="number"
                      min={0}
                      step="0.01"
                      value={row.debit || ""}
                      onChange={(e) => updateRow(row.key, { debit: parseFloat(e.target.value) || 0, credit: 0 })}
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      className="input"
                      type="number"
                      min={0}
                      step="0.01"
                      value={row.credit || ""}
                      onChange={(e) => updateRow(row.key, { credit: parseFloat(e.target.value) || 0, debit: 0 })}
                    />
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <button
                      type="button"
                      onClick={() => setRows((prev) => (prev.length > 2 ? prev.filter((r) => r.key !== row.key) : prev))}
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
        <button type="button" onClick={() => setRows((prev) => [...prev, newRow()])} className="btn-secondary mt-2 py-1 text-xs">
          <Plus size={14} /> Add New Row
        </button>
      </div>

      <div className="flex items-center justify-between rounded-md bg-gray-50 px-4 py-3">
        <div className="flex items-center gap-2 text-sm">
          {balanced ? (
            <>
              <CheckCircle2 size={16} className="text-green-600" />
              <span className="text-green-700">Balanced</span>
            </>
          ) : (
            <>
              <AlertTriangle size={16} className="text-amber-500" />
              <span className="text-amber-700">Not balanced</span>
            </>
          )}
        </div>
        <div className="flex gap-6 text-sm text-gray-600">
          <span>
            Sub Total / Debits: <span className="font-medium text-ink-800">{formatCurrency(totalDebit, currencyCode)}</span>
          </span>
          <span>
            Sub Total / Credits: <span className="font-medium text-ink-800">{formatCurrency(totalCredit, currencyCode)}</span>
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-gray-100 pt-4">
        <button type="button" disabled={saving !== null} onClick={() => submit("published")} className="btn-primary">
          {saving === "published" ? "Saving..." : "Save and Publish"}
        </button>
        <button type="button" disabled={saving !== null} onClick={() => submit("draft")} className="btn-secondary">
          {saving === "draft" ? "Saving..." : "Save as Draft"}
        </button>
        <button type="button" onClick={() => router.push("/manual-journals")} className="btn-secondary">
          Cancel
        </button>
      </div>
    </form>
  );
}
