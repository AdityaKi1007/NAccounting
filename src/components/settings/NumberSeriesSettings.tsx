"use client";

import { useState } from "react";
import { Pencil, Info } from "lucide-react";
import NumberSeriesEditModal from "@/components/settings/NumberSeriesEditModal";

interface Series {
  mode: "auto" | "manual";
  prefix: string;
  next_number: number;
  padding: number;
  restart_yearly: boolean;
}

interface Row {
  entityKey: string;
  label: string;
  series: Series;
}

function preview(series: Series) {
  if (series.mode === "manual") return "Entered manually";
  return `${series.prefix}${String(series.next_number).padStart(series.padding, "0")}`;
}

/** Settings -> Customization -> Transaction Number Series. Mirrors Zoho Books' "Default
 * Series" table: one row per module with a real sequential number (see
 * src/lib/number-series.ts's NUMBER_SERIES_MODULES for the full list and why two of Zoho's
 * rows — Retainer Invoice, Sales Return — are missing: this build doesn't have those
 * modules). Clicking a row's Edit action opens the same NumberSeriesEditModal every
 * document form's own "Configure" shortcut uses, so changes made here and there always agree. */
export default function NumberSeriesSettings({
  initialRows,
  initialMultipleSeriesEnabled,
  canManage,
}: {
  initialRows: Row[];
  initialMultipleSeriesEnabled: boolean;
  canManage: boolean;
}) {
  const [rows, setRows] = useState(initialRows);
  const [multipleSeriesEnabled, setMultipleSeriesEnabled] = useState(initialMultipleSeriesEnabled);
  const [togglingMultiple, setTogglingMultiple] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggleMultipleSeries() {
    if (!canManage) return;
    const next = !multipleSeriesEnabled;
    setTogglingMultiple(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/organization/multiple-series", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      if (!res.ok) throw new Error("Could not update this setting.");
      setMultipleSeriesEnabled(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update this setting.");
    } finally {
      setTogglingMultiple(false);
    }
  }

  const editingRow = rows.find((r) => r.entityKey === editingKey) ?? null;

  return (
    <div className="space-y-4">
      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="card flex items-center justify-between px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-ink-800">Default Series</h2>
          <p className="mt-0.5 text-xs text-gray-500">The numbering format used for each transaction type below.</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-700">
          <button
            type="button"
            role="switch"
            aria-checked={multipleSeriesEnabled}
            disabled={!canManage || togglingMultiple}
            onClick={toggleMultipleSeries}
            className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
              multipleSeriesEnabled ? "bg-brand-600" : "bg-gray-200"
            } ${!canManage ? "cursor-not-allowed opacity-60" : ""}`}
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                multipleSeriesEnabled ? "translate-x-4" : "translate-x-0.5"
              }`}
            />
          </button>
          Enable Multiple Transaction Series
        </label>
      </div>

      {multipleSeriesEnabled && (
        <div className="flex gap-2 rounded-md border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <Info size={16} className="mt-0.5 shrink-0" />
          <p>
            Named, per-branch series (e.g. a separate &quot;Series A&quot; / &quot;Series B&quot; per module) aren&apos;t
            supported in this build yet. Your preference is saved, but every module still uses the single Default
            Series below.
          </p>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-2.5">Module</th>
                <th className="px-4 py-2.5">Prefix</th>
                <th className="px-4 py-2.5">Starting Number</th>
                <th className="px-4 py-2.5">Restart Numbering</th>
                <th className="px-4 py-2.5">Preview</th>
                {canManage && <th className="px-4 py-2.5 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row) => (
                <tr key={row.entityKey} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-medium text-ink-800">{row.label}</td>
                  <td className="px-4 py-2.5 text-ink-700">{row.series.mode === "auto" ? row.series.prefix || "-" : "-"}</td>
                  <td className="px-4 py-2.5 text-ink-700">
                    {row.series.mode === "auto" ? String(row.series.next_number).padStart(row.series.padding, "0") : "-"}
                  </td>
                  <td className="px-4 py-2.5 text-ink-700">{row.series.restart_yearly ? "Every fiscal year" : "None"}</td>
                  <td className="px-4 py-2.5 text-ink-700">{preview(row.series)}</td>
                  {canManage && (
                    <td className="px-4 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => setEditingKey(row.entityKey)}
                        className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-brand-600"
                        title={`Edit ${row.label} numbering`}
                      >
                        <Pencil size={15} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editingRow && (
        <NumberSeriesEditModal
          open
          onClose={() => setEditingKey(null)}
          entityKey={editingRow.entityKey}
          label={editingRow.label}
          hideConfigureLink
          onSaved={(updated) =>
            setRows((prev) => prev.map((r) => (r.entityKey === editingRow.entityKey ? { ...r, series: updated } : r)))
          }
        />
      )}
    </div>
  );
}
