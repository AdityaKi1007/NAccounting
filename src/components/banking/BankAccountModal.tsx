"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/ui/Modal";

const CURRENCIES = ["AED", "USD", "EUR", "GBP", "INR"];

export interface GLAccountOption {
  id: string;
  name: string;
  type: string;
}

export interface BankAccountData {
  id?: string;
  account_type: string;
  account_name: string;
  account_code: string;
  currency: string;
  account_number: string;
  bank_name: string;
  bank_identifier_code: string;
  description: string;
  is_primary: boolean;
  /** Empty string = auto-create a new, freshly linked Chart of Accounts entry on save (see
   * getOrCreateBankGLAccount in auto-journal.ts) — set it to link this bank/credit-card
   * account to an EXISTING Chart of Accounts entry instead, e.g. one already created by hand
   * under Chart of Accounts, so a real-world account doesn't end up with two disconnected
   * ledger entries. */
  gl_account_id: string;
}

const empty: BankAccountData = {
  account_type: "bank",
  account_name: "",
  account_code: "",
  currency: "AED",
  account_number: "",
  bank_name: "",
  bank_identifier_code: "",
  description: "",
  is_primary: false,
  gl_account_id: "",
};

export default function BankAccountModal({
  open,
  onClose,
  initial,
  glAccountOptions,
}: {
  open: boolean;
  onClose: () => void;
  initial?: BankAccountData | null;
  glAccountOptions: GLAccountOption[];
}) {
  const router = useRouter();
  const [data, setData] = useState<BankAccountData>(initial ?? empty);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof BankAccountData>(key: K, value: BankAccountData[K]) {
    setData((prev) => ({ ...prev, [key]: value }));
  }

  async function onSave() {
    setError(null);
    if (!data.account_name.trim()) {
      setError("Account Name is required.");
      return;
    }
    setSaving(true);
    const url = data.id ? `/api/entities/bank-accounts/${data.id}` : `/api/entities/bank-accounts`;
    const method = data.id ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(typeof body.error === "string" ? body.error : "Could not save this account.");
      return;
    }
    setData(empty);
    onClose();
    router.refresh();
  }

  return (
    <Modal open={open} onClose={onClose} title={data.id ? "Edit Bank or Credit Card" : "Add Bank or Credit Card"} width="max-w-lg">
      <div className="space-y-4">
        {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <div>
          <label className="label">
            Select Account Type<span className="text-red-500">*</span>
          </label>
          <div className="flex items-center gap-6 pt-1">
            {[
              { value: "bank", label: "Bank" },
              { value: "credit_card", label: "Credit Card" },
            ].map((opt) => (
              <label key={opt.value} className="flex items-center gap-2 text-sm text-ink-800">
                <input
                  type="radio"
                  name="account_type"
                  checked={data.account_type === opt.value}
                  onChange={() => set("account_type", opt.value)}
                  className="h-4 w-4 border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                {opt.label}
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="label">
            Account Name<span className="text-red-500">*</span>
          </label>
          <input className="input" value={data.account_name} onChange={(e) => set("account_name", e.target.value)} />
        </div>

        <div>
          <label className="label">Account Code</label>
          <input className="input" value={data.account_code} onChange={(e) => set("account_code", e.target.value)} />
        </div>

        <div>
          <label className="label">
            Currency<span className="text-red-500">*</span>
          </label>
          <select className="input" value={data.currency} onChange={(e) => set("currency", e.target.value)}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Account Number</label>
          <input className="input" value={data.account_number} onChange={(e) => set("account_number", e.target.value)} />
        </div>

        <div>
          <label className="label">Bank Name</label>
          <input className="input" value={data.bank_name} onChange={(e) => set("bank_name", e.target.value)} />
        </div>

        <div>
          <label className="label">Bank Identifier Code</label>
          <input
            className="input"
            value={data.bank_identifier_code}
            onChange={(e) => set("bank_identifier_code", e.target.value)}
          />
        </div>

        <div>
          <label className="label">Link to Chart of Accounts</label>
          <select className="input" value={data.gl_account_id} onChange={(e) => set("gl_account_id", e.target.value)}>
            <option value="">Auto-create a new linked account</option>
            {glAccountOptions.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-400">
            {data.id
              ? "Change this only if this account is linked to the wrong Chart of Accounts entry — every receipt, payment and expense already posted against it stays exactly where it is."
              : "Leave as-is to get a fresh Chart of Accounts entry automatically, or pick an existing one if you already created it there by hand (e.g. under Chart of Accounts)."}
          </p>
        </div>

        <div>
          <label className="label">Description</label>
          <textarea
            className="input"
            rows={3}
            maxLength={500}
            placeholder="Max. 500 characters"
            value={data.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-ink-800">
          <input
            type="checkbox"
            checked={data.is_primary}
            onChange={(e) => set("is_primary", e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
          />
          Make this primary
        </label>

        <div className="flex items-center gap-2 border-t border-gray-100 pt-4">
          <button type="button" onClick={onSave} disabled={saving} className="btn-primary">
            {saving ? "Saving..." : "Save"}
          </button>
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}
