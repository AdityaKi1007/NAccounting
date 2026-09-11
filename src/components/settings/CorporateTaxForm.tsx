"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface AccountOption {
  id: string;
  label: string;
}

interface Org {
  id: string;
  corporate_tax_registration_number: string | null;
  corporate_tax_rate: number | string;
  corporate_tax_first_return_from: string | Date | null;
  corporate_tax_liability_account_id: string | null;
  corporate_tax_liability_offset_account_id: string | null;
  corporate_tax_add_back_expense_account_id: string | null;
  corporate_tax_income_deducted_account_id: string | null;
  corporate_tax_entertainment_expenditure_account_id: string | null;
  corporate_tax_net_interest_expenditure_account_id: string | null;
}

function toDateInput(v: string | Date | null) {
  if (!v) return "";
  // Same Date-vs-string handling as TaxSettingsForm.tsx's toDateInput — pg (and the RSC
  // serialization boundary) can hand this back as a real Date object, not the string the
  // type claims, so read the UTC calendar fields directly rather than round-tripping through
  // toString()/toISOString().
  if (v instanceof Date) {
    const y = v.getUTCFullYear();
    const m = String(v.getUTCMonth() + 1).padStart(2, "0");
    const d = String(v.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return String(v).slice(0, 10);
}

function AccountSelect({
  label,
  required,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
  options: AccountOption[];
  disabled: boolean;
}) {
  return (
    <div>
      <label className="label">
        {label}
        {required ? " *" : ""}
      </label>
      <select className="input" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select an account</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function CorporateTaxForm({
  organization,
  accountOptions,
  canManage,
}: {
  organization: Org;
  accountOptions: AccountOption[];
  canManage: boolean;
}) {
  const router = useRouter();
  const o = organization;

  const [trn, setTrn] = useState(o.corporate_tax_registration_number ?? "");
  const [rate, setRate] = useState(String(o.corporate_tax_rate ?? 9));
  const [firstReturnFrom, setFirstReturnFrom] = useState(toDateInput(o.corporate_tax_first_return_from));
  const [liabilityAccount, setLiabilityAccount] = useState(o.corporate_tax_liability_account_id ?? "");
  const [liabilityOffsetAccount, setLiabilityOffsetAccount] = useState(
    o.corporate_tax_liability_offset_account_id ?? ""
  );
  const [addBackExpenseAccount, setAddBackExpenseAccount] = useState(
    o.corporate_tax_add_back_expense_account_id ?? ""
  );
  const [incomeDeductedAccount, setIncomeDeductedAccount] = useState(
    o.corporate_tax_income_deducted_account_id ?? ""
  );
  const [entertainmentAccount, setEntertainmentAccount] = useState(
    o.corporate_tax_entertainment_expenditure_account_id ?? ""
  );
  const [netInterestAccount, setNetInterestAccount] = useState(
    o.corporate_tax_net_interest_expenditure_account_id ?? ""
  );

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSave() {
    setError(null);
    setMessage(null);
    if (!trn.trim()) {
      setError("Tax Registration Number is required.");
      return;
    }
    if (!firstReturnFrom) {
      setError("Generate First Corporate Tax Return From is required.");
      return;
    }
    if (!liabilityAccount) {
      setError("Corporate Tax Liability Account is required.");
      return;
    }
    if (!liabilityOffsetAccount) {
      setError("Corporate Tax Liability Offset Account is required.");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/settings/corporate-tax", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        corporate_tax_registration_number: trn,
        corporate_tax_rate: rate,
        corporate_tax_first_return_from: firstReturnFrom,
        corporate_tax_liability_account_id: liabilityAccount,
        corporate_tax_liability_offset_account_id: liabilityOffsetAccount,
        corporate_tax_add_back_expense_account_id: addBackExpenseAccount || null,
        corporate_tax_income_deducted_account_id: incomeDeductedAccount || null,
        corporate_tax_entertainment_expenditure_account_id: entertainmentAccount || null,
        corporate_tax_net_interest_expenditure_account_id: netInterestAccount || null,
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
          Only owners and admins can change corporate tax settings. You can view the current settings below.
        </div>
      )}
      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {message && <div className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{message}</div>}

      <div className="card space-y-4 p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Tax Registration Number *</label>
            <input
              className="input"
              value={trn}
              disabled={disabled}
              placeholder="Eg: 01234567"
              onChange={(e) => setTrn(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Corporate Tax Rate</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.01"
                className="input"
                value={rate}
                disabled={disabled}
                onChange={(e) => setRate(e.target.value)}
              />
              <span className="text-sm text-gray-500">%</span>
            </div>
          </div>
          <div>
            <label className="label">Generate First Corporate Tax Return From *</label>
            <input
              type="date"
              className="input"
              value={firstReturnFrom}
              disabled={disabled}
              onChange={(e) => setFirstReturnFrom(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="card space-y-4 p-6">
        <h2 className="text-sm font-semibold text-ink-800">Corporate Tax Accounts</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <AccountSelect
            label="Corporate Tax Liability Account"
            required
            value={liabilityAccount}
            onChange={setLiabilityAccount}
            options={accountOptions}
            disabled={disabled}
          />
          <AccountSelect
            label="Corporate Tax Liability Offset Account"
            required
            value={liabilityOffsetAccount}
            onChange={setLiabilityOffsetAccount}
            options={accountOptions}
            disabled={disabled}
          />
          <AccountSelect
            label="Add Back Expense Accounts"
            value={addBackExpenseAccount}
            onChange={setAddBackExpenseAccount}
            options={accountOptions}
            disabled={disabled}
          />
          <AccountSelect
            label="Income Accounts To Be Deducted"
            value={incomeDeductedAccount}
            onChange={setIncomeDeductedAccount}
            options={accountOptions}
            disabled={disabled}
          />
          <AccountSelect
            label="Entertainment Expenditure Accounts"
            value={entertainmentAccount}
            onChange={setEntertainmentAccount}
            options={accountOptions}
            disabled={disabled}
          />
          <AccountSelect
            label="Net Interest Expenditure"
            value={netInterestAccount}
            onChange={setNetInterestAccount}
            options={accountOptions}
            disabled={disabled}
          />
        </div>
        {/* Disclosed simplification: the reference screenshot shows these six as chip-style
            pickers that read as capable of holding more than one account (each shown with an
            "x" to remove). This build stores exactly one account per field (real single-value
            FK columns — see the 2026-09-10 migration), matching every other single-account
            settings field already in this app (e.g. an Expense's "Paid Through" account).
            Multi-account support per field isn't implemented. */}
      </div>

      <div className="border-t border-gray-100 pt-4">
        <button onClick={onSave} disabled={saving || disabled} className="btn-primary">
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}
