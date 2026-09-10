"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X, Info } from "lucide-react";

interface Series {
  mode: "auto" | "manual";
  prefix: string;
  next_number: number;
  padding: number;
  restart_yearly: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: (series: Series) => void;
  /** The number_series.entity_key this modal edits (e.g. "invoices", "quotes", "credit-notes"). */
  entityKey: string;
  /** Human label used in the title/copy, e.g. "Invoice", "Quote". */
  label: string;
  /** Set when this modal is opened FROM the Transaction Number Series settings page itself —
   * hides the "Configure →" link back to that same page. */
  hideConfigureLink?: boolean;
}

/** Generic per-module number-series editor — the same "auto-generate vs. enter manually"
 * flow Zoho Books shows, reused for every document/record type that has a real sequential
 * series (see src/lib/number-series.ts's DEFAULT_PREFIXES for the full list). Originally
 * built invoice-only (see the former InvoiceNumberPreferencesModal.tsx, now replaced by
 * this parameterized version so the same UI works from both a document form's "Configure"
 * shortcut and the Settings -> Transaction Number Series page. */
export default function NumberSeriesEditModal({ open, onClose, onSaved, entityKey, label, hideConfigureLink }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [mode, setMode] = useState<"auto" | "manual">("auto");
  const [prefix, setPrefix] = useState("");
  const [nextNumber, setNextNumber] = useState("1");
  const [padding, setPadding] = useState(6);
  const [restartYearly, setRestartYearly] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    fetch(`/api/settings/number-series/${entityKey}`)
      .then((res) => res.json())
      .then((data) => {
        const series: Series = data.series;
        setMode(series.mode);
        setPrefix(series.prefix);
        setNextNumber(String(series.next_number));
        setPadding(series.padding);
        setRestartYearly(series.restart_yearly);
      })
      .catch(() => setError("Could not load current numbering preferences."))
      .finally(() => setLoading(false));
  }, [open, entityKey]);

  async function onSave() {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/settings/number-series/${entityKey}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode,
        prefix,
        next_number: parseInt(nextNumber, 10) || 1,
        restart_yearly: restartYearly,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === "string" ? data.error : "Could not save numbering preferences.");
      return;
    }
    const data = await res.json();
    onSaved(data.series);
    onClose();
  }

  if (!open) return null;

  const nextNumberPreview = `${prefix}${nextNumber.padStart(padding, "0")}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-5 py-4">
          <h2 className="text-base font-semibold text-ink-800">Configure {label} Number Preferences</h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-red-500 hover:bg-red-50">
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="px-5 py-10 text-center text-sm text-gray-400">Loading...</div>
        ) : (
          <div className="space-y-5 px-5 py-5">
            {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

            {!hideConfigureLink && (
              <div className="flex items-start justify-between gap-3 border-b border-gray-100 pb-4">
                <div className="flex gap-2">
                  <Info size={16} className="mt-0.5 shrink-0 text-gray-400" />
                  <p className="text-xs text-gray-500">
                    Configure multiple transaction number series to auto-generate transaction numbers with unique
                    prefixes according to your business needs.
                  </p>
                </div>
                <Link
                  href="/settings/customization/transaction-number-series"
                  className="shrink-0 whitespace-nowrap text-xs font-medium text-brand-600 hover:underline"
                >
                  Configure &rarr;
                </Link>
              </div>
            )}

            {mode === "auto" && (
              <p className="text-sm text-ink-700">
                Your {label.toLowerCase()} numbers are set on auto-generate mode to save your time. Are you sure about
                changing this setting?
              </p>
            )}

            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm font-medium text-ink-800">
                <input
                  type="radio"
                  name={`number_mode_${entityKey}`}
                  checked={mode === "auto"}
                  onChange={() => setMode("auto")}
                  className="h-4 w-4 border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                Continue auto-generating {label.toLowerCase()} numbers
              </label>

              {mode === "auto" && (
                <div className="ml-6 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">Prefix</label>
                      <input className="input" value={prefix} onChange={(e) => setPrefix(e.target.value)} />
                    </div>
                    <div>
                      <label className="label">Next Number</label>
                      <input
                        className="input"
                        value={nextNumber}
                        onChange={(e) => setNextNumber(e.target.value.replace(/[^0-9]/g, ""))}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-gray-400">Next {label.toLowerCase()} will be numbered {nextNumberPreview}</p>
                  <label className="flex items-center gap-2 text-sm text-ink-800">
                    <input
                      type="checkbox"
                      checked={restartYearly}
                      onChange={(e) => setRestartYearly(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                    />
                    Restart numbering for {label.toLowerCase()}s at the start of each fiscal year
                  </label>
                </div>
              )}

              <label className="flex items-center gap-2 text-sm font-medium text-ink-800">
                <input
                  type="radio"
                  name={`number_mode_${entityKey}`}
                  checked={mode === "manual"}
                  onChange={() => setMode("manual")}
                  className="h-4 w-4 border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                Enter {label.toLowerCase()} numbers manually
              </label>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 border-t border-gray-100 px-5 py-4">
          <button type="button" onClick={onSave} disabled={saving || loading} className="btn-primary">
            {saving ? "Saving..." : "Save"}
          </button>
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
