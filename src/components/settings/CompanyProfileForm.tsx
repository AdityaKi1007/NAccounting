"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { COUNTRIES } from "@/lib/countries";
import OrgLogoUploader from "@/components/settings/OrgLogoUploader";

const CURRENCIES = ["AED", "USD", "EUR", "GBP", "INR"];

const INDUSTRIES = [
  "Accounting",
  "Advertising & Marketing",
  "Agriculture",
  "Automotive",
  "Banking & Finance",
  "Construction",
  "Consulting",
  "Education",
  "Energy & Utilities",
  "Fashion & Apparel",
  "Food & Beverage",
  "Government",
  "Healthcare",
  "Hospitality & Tourism",
  "Import & Export",
  "Information Technology",
  "Insurance",
  "Legal Services",
  "Logistics & Transportation",
  "Manufacturing",
  "Media & Entertainment",
  "Non-Profit",
  "Oil & Gas",
  "Pharmaceuticals",
  "Real Estate",
  "Retail",
  "Technology",
  "Telecommunications",
  "Other",
];

const TIMEZONES = [
  { label: "(GMT+4:00) Dubai, Abu Dhabi", value: "Asia/Dubai" },
  { label: "(GMT+3:00) Riyadh, Kuwait", value: "Asia/Riyadh" },
  { label: "(GMT+5:30) Mumbai, New Delhi", value: "Asia/Kolkata" },
  { label: "(GMT+0:00) London", value: "Europe/London" },
  { label: "(GMT-5:00) New York", value: "America/New_York" },
  { label: "(GMT-8:00) Los Angeles", value: "America/Los_Angeles" },
  { label: "(GMT+8:00) Singapore", value: "Asia/Singapore" },
  { label: "(GMT+10:00) Sydney", value: "Australia/Sydney" },
  { label: "(GMT+0:00) UTC", value: "UTC" },
];

const DATE_FORMATS = ["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"];

interface Org {
  id: string;
  name: string;
  currency: string;
  fiscal_year_start: string;
  industry: string | null;
  location_country: string;
  is_designated_zone: boolean;
  registration_number: string | null;
  tax_registration_number: string | null;
  address_attention: string | null;
  address_street1: string | null;
  address_street2: string | null;
  address_city: string | null;
  address_state: string | null;
  address_zip: string | null;
  address_phone: string | null;
  address_fax: string | null;
  timezone: string;
  date_format: string;
  report_basis: string;
}

export default function CompanyProfileForm({
  organization,
  initialLogoDataUri,
}: {
  organization: Org;
  initialLogoDataUri: string | null;
}) {
  const router = useRouter();
  const o = organization;

  const [name, setName] = useState(o.name);
  const [industry, setIndustry] = useState(o.industry ?? "");
  const [locationCountry, setLocationCountry] = useState(o.location_country);
  const [isDesignatedZone, setIsDesignatedZone] = useState(o.is_designated_zone);
  const [registrationNumber, setRegistrationNumber] = useState(o.registration_number ?? "");
  const [taxRegistrationNumber, setTaxRegistrationNumber] = useState(o.tax_registration_number ?? "");

  const [addressAttention, setAddressAttention] = useState(o.address_attention ?? "");
  const [addressStreet1, setAddressStreet1] = useState(o.address_street1 ?? "");
  const [addressStreet2, setAddressStreet2] = useState(o.address_street2 ?? "");
  const [addressCity, setAddressCity] = useState(o.address_city ?? "");
  const [addressState, setAddressState] = useState(o.address_state ?? "");
  const [addressZip, setAddressZip] = useState(o.address_zip ?? "");
  const [addressPhone, setAddressPhone] = useState(o.address_phone ?? "");
  const [addressFax, setAddressFax] = useState(o.address_fax ?? "");

  const [timezone, setTimezone] = useState(o.timezone);
  const [dateFormat, setDateFormat] = useState(o.date_format);
  const [currency, setCurrency] = useState(o.currency);
  const [fiscalYearStart, setFiscalYearStart] = useState(o.fiscal_year_start);
  const [reportBasis, setReportBasis] = useState(o.report_basis);

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSave() {
    setSaving(true);
    setError(null);
    setMessage(null);
    const res = await fetch("/api/settings/organization", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        industry,
        location_country: locationCountry,
        is_designated_zone: isDesignatedZone,
        registration_number: registrationNumber,
        tax_registration_number: taxRegistrationNumber,
        address_attention: addressAttention,
        address_street1: addressStreet1,
        address_street2: addressStreet2,
        address_city: addressCity,
        address_state: addressState,
        address_zip: addressZip,
        address_phone: addressPhone,
        address_fax: addressFax,
        timezone,
        date_format: dateFormat,
        currency,
        fiscal_year_start: fiscalYearStart,
        report_basis: reportBasis,
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

  return (
    <div className="max-w-3xl space-y-6">
      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {message && <div className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{message}</div>}

      <div className="card space-y-4 p-6">
        <h2 className="text-sm font-semibold text-ink-800">Organization Logo</h2>
        <OrgLogoUploader initialLogoDataUri={initialLogoDataUri} />
      </div>

      <div className="card space-y-4 p-6">
        <h2 className="text-sm font-semibold text-ink-800">Organization Details</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">
              Organization Name<span className="text-red-500"> *</span>
            </label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="label">
              Industry<span className="text-red-500"> *</span>
            </label>
            <select className="input" value={industry} onChange={(e) => setIndustry(e.target.value)}>
              <option value="">Select an industry</option>
              {INDUSTRIES.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">
              Organization Location<span className="text-red-500"> *</span>
            </label>
            <select className="input" value={locationCountry} onChange={(e) => setLocationCountry(e.target.value)}>
              {COUNTRIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <label className="mt-2 flex items-center gap-2 text-sm text-ink-800">
              <input
                type="checkbox"
                checked={isDesignatedZone}
                onChange={(e) => setIsDesignatedZone(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              />
              My business is in a Designated Zone
            </label>
          </div>
          <div>
            <label className="label">Company Registration Number</label>
            <input
              className="input"
              value={registrationNumber}
              placeholder="Trade license / registration number"
              onChange={(e) => setRegistrationNumber(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Tax Registration Number (TRN)</label>
            <input
              className="input"
              value={taxRegistrationNumber}
              placeholder="VAT / TRN number"
              onChange={(e) => setTaxRegistrationNumber(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="card space-y-4 p-6">
        <h2 className="text-sm font-semibold text-ink-800">Organization Address</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input
            className="input sm:col-span-2"
            placeholder="Attention"
            value={addressAttention}
            onChange={(e) => setAddressAttention(e.target.value)}
          />
          <input
            className="input sm:col-span-2"
            placeholder="Street 1"
            value={addressStreet1}
            onChange={(e) => setAddressStreet1(e.target.value)}
          />
          <input
            className="input sm:col-span-2"
            placeholder="Street 2"
            value={addressStreet2}
            onChange={(e) => setAddressStreet2(e.target.value)}
          />
          <input className="input" placeholder="City" value={addressCity} onChange={(e) => setAddressCity(e.target.value)} />
          <input
            className="input"
            placeholder="ZIP/Postal Code"
            value={addressZip}
            onChange={(e) => setAddressZip(e.target.value)}
          />
          <input
            className="input"
            placeholder="State / Emirate"
            value={addressState}
            onChange={(e) => setAddressState(e.target.value)}
          />
          <input className="input" placeholder="Phone" value={addressPhone} onChange={(e) => setAddressPhone(e.target.value)} />
          <input
            className="input sm:col-span-2"
            placeholder="Fax Number"
            value={addressFax}
            onChange={(e) => setAddressFax(e.target.value)}
          />
        </div>
      </div>

      <div className="card space-y-4 p-6">
        <h2 className="text-sm font-semibold text-ink-800">Regional Settings</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Time Zone</label>
            <select className="input" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
              {TIMEZONES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Date Format</label>
            <select className="input" value={dateFormat} onChange={(e) => setDateFormat(e.target.value)}>
              {DATE_FORMATS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Base Currency</label>
            <select className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Fiscal Year Start (MM-DD)</label>
            <input
              className="input"
              value={fiscalYearStart}
              placeholder="01-01"
              onChange={(e) => setFiscalYearStart(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Report Basis</label>
            <div className="flex items-center gap-6 pt-1.5">
              {[
                { value: "accrual", label: "Accrual" },
                { value: "cash", label: "Cash" },
              ].map((opt) => (
                <label key={opt.value} className="flex items-center gap-2 text-sm text-ink-800">
                  <input
                    type="radio"
                    name="report_basis"
                    checked={reportBasis === opt.value}
                    onChange={() => setReportBasis(opt.value)}
                    className="h-4 w-4 border-gray-300 text-brand-600 focus:ring-brand-500"
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-gray-100 pt-4">
        <button onClick={onSave} disabled={saving} className="btn-primary">
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
