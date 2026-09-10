"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Org {
  id: string;
  tax_registration_number: string | null;
  tax_identification_number: string | null;
  international_trade_enabled: boolean;
  business_legal_name: string | null;
  business_trade_name: string | null;
  vat_registered_on: string | Date | null;
  first_tax_return_from: string | Date | null;
  tax_reporting_period: string;
}

function toDateInput(v: string | Date | null) {
  if (!v) return "";
  // pg (and the RSC serialization boundary this prop crosses from the server component) can
  // hand this back as an actual Date object rather than the "string | null" the type below
  // claims — String(aDateObject) produces its full toString() form (e.g. "Wed Jan 01 2025
  // 00:00:00 GMT+0000..."), and slicing that garbles into something that isn't a valid
  // <input type="date"> value at all (browsers silently render it blank). Read the UTC
  // calendar fields directly instead of going through toString()/toISOString() shifting.
  if (v instanceof Date) {
    const y = v.getUTCFullYear();
    const m = String(v.getUTCMonth() + 1).padStart(2, "0");
    const d = String(v.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return String(v).slice(0, 10);
}

export default function TaxSettingsForm({ organization, canManage }: { organization: Org; canManage: boolean }) {
  const router = useRouter();
  const o = organization;

  const [trn, setTrn] = useState(o.tax_registration_number ?? "");
  const [tin, setTin] = useState(o.tax_identification_number ?? "");
  const [internationalTrade, setInternationalTrade] = useState(o.international_trade_enabled);
  const [legalName, setLegalName] = useState(o.business_legal_name ?? "");
  const [tradeName, setTradeName] = useState(o.business_trade_name ?? "");
  // "VAT Registered" isn't its own DB column — it's derived from whether a registration date
  // is already on file, so re-opening a saved org with a date shows the toggle already on.
  const [vatRegistered, setVatRegistered] = useState(Boolean(o.vat_registered_on));
  const [vatRegisteredOn, setVatRegisteredOn] = useState(toDateInput(o.vat_registered_on));
  const [firstTaxReturnFrom, setFirstTaxReturnFrom] = useState(toDateInput(o.first_tax_return_from));
  const [reportingPeriod, setReportingPeriod] = useState(o.tax_reporting_period);

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [validateNotice, setValidateNotice] = useState(false);

  async function onSave() {
    setError(null);
    setMessage(null);
    if (vatRegistered && !vatRegisteredOn) {
      setError("VAT Registered On is required when \"Registered for VAT\" is checked.");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/settings/tax", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tax_registration_number: trn,
        tax_identification_number: tin,
        international_trade_enabled: internationalTrade,
        business_legal_name: legalName,
        business_trade_name: tradeName,
        // Unchecking "Registered for VAT" clears the date rather than just hiding it, so the
        // two stay consistent instead of the UI silently disagreeing with what's saved.
        vat_registered_on: vatRegistered ? vatRegisteredOn : "",
        first_tax_return_from: firstTaxReturnFrom,
        tax_reporting_period: reportingPeriod,
      }),
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
          Only owners and admins can change tax settings. You can view the current settings below.
        </div>
      )}
      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {message && <div className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{message}</div>}

      <div className="card space-y-4 p-6">
        <h2 className="text-sm font-semibold text-ink-800">Tax Registration</h2>

        <div>
          <label className="flex items-center gap-2 text-sm text-ink-800">
            <input
              type="checkbox"
              checked={vatRegistered}
              disabled={disabled}
              onChange={(e) => setVatRegistered(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
            />
            Registered for VAT
          </label>
          <p className="mt-1 text-xs text-gray-400">Turn this on once you have a Tax Registration Number.</p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">
              Tax Registration Number (TRN)
              <button
                type="button"
                onClick={() => setValidateNotice(true)}
                className="ml-2 text-xs font-normal text-brand-600 hover:underline"
              >
                Validate TRN
              </button>
            </label>
            <input
              className="input"
              value={trn}
              disabled={disabled}
              placeholder="100XXXXXXXXXXXX"
              onChange={(e) => setTrn(e.target.value)}
            />
            <p className="mt-1 text-xs text-gray-400">Also shown on your Company Profile page.</p>
            {validateNotice && (
              <p className="mt-1 text-xs text-amber-600">TRN validation against the tax authority isn&apos;t available in this build yet.</p>
            )}
          </div>
          <div>
            <label className="label">Tax Identification Number (TIN)</label>
            <input className="input" value={tin} disabled={disabled} onChange={(e) => setTin(e.target.value)} />
          </div>
          <div>
            <label className="label">VAT Registered On{vatRegistered ? " *" : ""}</label>
            <input
              type="date"
              className="input"
              value={vatRegisteredOn}
              disabled={disabled || !vatRegistered}
              onChange={(e) => setVatRegisteredOn(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Generate First Tax Return From</label>
            <input
              type="date"
              className="input"
              value={firstTaxReturnFrom}
              disabled={disabled}
              onChange={(e) => setFirstTaxReturnFrom(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Tax Reporting Period</label>
            <select
              className="input"
              value={reportingPeriod}
              disabled={disabled}
              onChange={(e) => setReportingPeriod(e.target.value)}
            >
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="annually">Annually</option>
            </select>
          </div>
          <div>
            <label className="flex items-center gap-2 text-sm text-ink-800">
              <input
                type="checkbox"
                checked={internationalTrade}
                disabled={disabled}
                onChange={(e) => setInternationalTrade(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              />
              Enable International Trade
            </label>
            <p className="mt-1 text-xs text-gray-400">Shows extra fields for cross-border trade on transactions that need them.</p>
          </div>
        </div>
      </div>

      <div className="card space-y-4 p-6">
        <h2 className="text-sm font-semibold text-ink-800">Business Identity</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Business Legal Name</label>
            <input className="input" value={legalName} disabled={disabled} onChange={(e) => setLegalName(e.target.value)} />
          </div>
          <div>
            <label className="label">Business Trade Name</label>
            <input className="input" value={tradeName} disabled={disabled} onChange={(e) => setTradeName(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-gray-100 pt-4">
        <button onClick={onSave} disabled={saving || disabled} className="btn-primary">
          {saving ? "Saving..." : "Save Changes"}
        </button>
        {/* Styled as a link to match the reference screenshot, but inert — there's no
            accountant-directory feature in this build to send it to. */}
        <span className="text-sm text-brand-600">Find an Accountant</span>
      </div>
    </div>
  );
}
