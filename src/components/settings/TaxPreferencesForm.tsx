"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function TaxPreferencesForm({
  organization,
  canManage,
}: {
  organization: { id: string; profit_margin_scheme_enabled: boolean };
  canManage: boolean;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(organization.profit_margin_scheme_enabled);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSave() {
    setError(null);
    setMessage(null);
    setSaving(true);
    const res = await fetch("/api/settings/tax-preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profit_margin_scheme_enabled: enabled }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === "string" ? data.error : "Could not save changes.");
      return;
    }
    setMessage("Saved.");
    router.refresh();
  }

  const disabled = !canManage;

  return (
    <div className="max-w-3xl space-y-6">
      {!canManage && (
        <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Only owners and admins can change tax preferences. You can view the current setting below.
        </div>
      )}
      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {message && <div className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{message}</div>}

      <div className="card space-y-2 p-6">
        <h2 className="text-sm font-semibold text-ink-800">Profit Margin Scheme</h2>
        <p className="text-sm text-gray-500">
          The Profit Margin Scheme allows you to calculate VAT based on the profit margin rather than the
          selling price. This is to avoid double taxation on goods that are specified in the VAT regulations.
        </p>
        <label className="flex items-center gap-2 pt-2 text-sm text-ink-800">
          <input
            type="checkbox"
            checked={enabled}
            disabled={disabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
          />
          Enable Profit Margin Scheme
        </label>
        {/* Disclosed, deliberate limitation: this build has no goods/item-level margin-tracking
            or a "margin scheme" line-item tax calculation mode — the toggle is a real, persisted
            per-org preference (same shape as the existing "Enable Multiple Transaction Series"
            toggle in Transaction Number Series settings), but turning it on doesn't yet change
            how tax is computed anywhere else in the app. */}
        {enabled && (
          <p className="text-xs text-amber-600">
            Saved as a preference. Document tax calculation in this build doesn&apos;t yet apply
            margin-scheme logic automatically — that&apos;s further scope.
          </p>
        )}
      </div>

      <div className="border-t border-gray-100 pt-4">
        <button onClick={onSave} disabled={saving || disabled} className="btn-primary">
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}
