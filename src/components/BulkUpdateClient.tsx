"use client";

import { useEffect, useMemo, useState } from "react";
import { entities, type FieldDef } from "@/lib/entities";
import { formatCurrency, titleCase } from "@/lib/format";
import { CheckSquare, Square } from "lucide-react";

const OPTIONS = [
  { key: "items", label: "Items" },
  { key: "customers", label: "Customers" },
  { key: "vendors", label: "Vendors" },
];

export default function BulkUpdateClient() {
  const [entityKey, setEntityKey] = useState("items");
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [field, setField] = useState("");
  const [value, setValue] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  const entity = entities[entityKey as keyof typeof entities];
  const editableFields = useMemo(
    () => entity.fields.filter((f: FieldDef) => !f.refEntity),
    [entity]
  );
  const fieldDef = editableFields.find((f) => f.name === field);

  useEffect(() => {
    setLoading(true);
    setSelected(new Set());
    setMessage(null);
    fetch(`/api/entities/${entityKey}`)
      .then((r) => r.json())
      .then((data) => {
        setRows(data.rows ?? []);
        setField(editableFields[0]?.name ?? "");
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityKey]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((r) => String(r.id)))));
  }

  async function apply() {
    if (selected.size === 0 || !field) return;
    setApplying(true);
    setMessage(null);
    const res = await fetch("/api/bulk-update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entityKey,
        ids: Array.from(selected),
        field,
        value: fieldDef?.type === "boolean" ? value === "true" : value,
      }),
    });
    setApplying(false);
    if (res.ok) {
      const data = await res.json();
      setMessage(`Updated ${data.updated} record(s).`);
      const refreshed = await fetch(`/api/entities/${entityKey}`).then((r) => r.json());
      setRows(refreshed.rows ?? []);
      setSelected(new Set());
    } else {
      const data = await res.json().catch(() => ({}));
      setMessage(data.error ?? "Could not apply the update.");
    }
  }

  return (
    <div className="p-6">
      <div className="card space-y-4 p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="label">List</label>
            <select className="input" value={entityKey} onChange={(e) => setEntityKey(e.target.value)}>
              {OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Field to Update</label>
            <select className="input" value={field} onChange={(e) => setField(e.target.value)}>
              {editableFields.map((f) => (
                <option key={f.name} value={f.name}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">New Value</label>
            {fieldDef?.type === "select" ? (
              <select className="input" value={value} onChange={(e) => setValue(e.target.value)}>
                <option value="">Select</option>
                {fieldDef.options?.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : fieldDef?.type === "boolean" ? (
              <select className="input" value={value} onChange={(e) => setValue(e.target.value)}>
                <option value="true">Yes / Active</option>
                <option value="false">No / Inactive</option>
              </select>
            ) : (
              <input
                className="input"
                type={fieldDef?.type === "number" || fieldDef?.type === "currency" ? "number" : "text"}
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={apply}
            disabled={selected.size === 0 || applying}
            className="btn-primary"
          >
            {applying ? "Applying..." : `Apply to ${selected.size} selected`}
          </button>
          {message && <span className="text-sm text-gray-600">{message}</span>}
        </div>
      </div>

      <div className="card mt-4 overflow-x-auto">
        {loading ? (
          <p className="py-16 text-center text-sm text-gray-400">Loading...</p>
        ) : rows.length === 0 ? (
          <p className="py-16 text-center text-sm text-gray-400">No records found.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="w-10 px-4 py-2.5">
                  <button onClick={toggleAll} className="flex items-center text-gray-500">
                    {selected.size === rows.length ? <CheckSquare size={16} /> : <Square size={16} />}
                  </button>
                </th>
                {entity.listColumns.slice(0, 4).map((col) => (
                  <th key={col} className="px-4 py-2.5">
                    {entity.fields.find((f) => f.name === col)?.label ?? titleCase(col)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row) => {
                const id = String(row.id);
                const checked = selected.has(id);
                return (
                  <tr key={id} className={checked ? "bg-brand-50/40" : undefined}>
                    <td className="px-4 py-2">
                      <button onClick={() => toggle(id)} className="flex items-center text-gray-500">
                        {checked ? <CheckSquare size={16} className="text-brand-600" /> : <Square size={16} />}
                      </button>
                    </td>
                    {entity.listColumns.slice(0, 4).map((col) => {
                      const fd = entity.fields.find((f) => f.name === col);
                      const val = row[col];
                      return (
                        <td key={col} className="whitespace-nowrap px-4 py-2 text-ink-800">
                          {fd?.type === "currency"
                            ? formatCurrency(val)
                            : fd?.type === "boolean"
                            ? val
                              ? "Yes"
                              : "No"
                            : String(val ?? "-")}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
