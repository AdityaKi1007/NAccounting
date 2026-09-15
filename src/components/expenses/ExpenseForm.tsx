"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AttachmentsField from "@/components/attachments/AttachmentsField";
import { uploadPendingAttachments } from "@/lib/attachments-client";
import Combobox from "@/components/ui/Combobox";
import GroupedCombobox from "@/components/ui/GroupedCombobox";
import { depositToGroupLabel } from "@/lib/accounts";

export interface ExpenseOption {
  value: string;
  label: string;
}

/** "Paid Through" option carrying the linked Chart of Accounts type (bank_accounts.gl_account_id
 * -> accounts.type) so it can be grouped the same way RecordPaymentForm.tsx/
 * RecordPaymentMadeForm.tsx already group their own "Deposit To"/"Paid Through" pickers — see
 * depositToGroupLabel in lib/accounts.ts. 2026-09-15: "make same selection for paid through on
 * expense creation page same as on record payments page". */
export interface BankAccountOption {
  value: string;
  label: string;
  glAccountType: string | null;
}

interface TaxRateOption extends ExpenseOption {
  rate: number;
}

const TAX_TREATMENTS: ExpenseOption[] = [
  { label: "VAT Registered", value: "vat_registered" },
  { label: "Non VAT Registered", value: "non_vat_registered" },
  { label: "GCC VAT Registered", value: "gcc_vat_registered" },
];

const EMIRATES: ExpenseOption[] = [
  "Abu Dhabi",
  "Dubai",
  "Sharjah",
  "Ajman",
  "Umm Al Quwain",
  "Ras al-Khaimah",
  "Fujairah",
].map((e) => ({ label: e, value: e }));

const round2 = (n: number) => Math.round(n * 100) / 100;

function toDateInput(v: unknown) {
  // expense_date comes straight off the pg row as a JS Date object (this app's db.ts doesn't
  // override pg's default `date` type parser) — String(date) yields something like "Fri Sep
  // 04 2026 ...", not the "YYYY-MM-DD" an <input type="date"> needs, so that case has to go
  // through toISOString() rather than the plain-string .slice(0, 10) used for values that are
  // already a "YYYY-MM-DD"-prefixed string.
  if (!v) return new Date().toISOString().slice(0, 10);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

interface Props {
  recordId?: string;
  initial: Record<string, unknown> | null;
  currency: string;
  defaultPlaceOfSupply: string;
  accountOptions: ExpenseOption[];
  bankOptions: BankAccountOption[];
  vendorOptions: ExpenseOption[];
  customerOptions: ExpenseOption[];
  taxRateOptions: TaxRateOption[];
}

/** Bespoke "Record Expense" form matching the Zoho Books reference screenshot. Not the
 * generic EntityForm because: (1) picking a Tax needs to compute tax_amount client-side from
 * the chosen tax_rates.rate x amount — the generic form has no notion of one field deriving
 * another; (2) the screenshot's two-tone grouping (primary fields on a grey band, everything
 * else below) doesn't match the generic form's single field-list layout. Tax Treatment/Place
 * of Supply/Reverse Charge/Customer Name are capture-only — see entities.ts's own comment on
 * the expenses entity and migrations/1760000000000_expense_tax_fields.js for what that means
 * and doesn't mean. Posts straight to the generic /api/entities/expenses endpoint, which
 * already knows how to sync the auto-journal for this entity (see auto-journal.ts). */
export default function ExpenseForm({
  recordId,
  initial,
  currency,
  defaultPlaceOfSupply,
  accountOptions,
  bankOptions,
  vendorOptions,
  customerOptions,
  taxRateOptions,
}: Props) {
  const router = useRouter();
  const h = initial ?? {};

  const [expenseDate, setExpenseDate] = useState(toDateInput(h.expense_date));
  const [accountId, setAccountId] = useState(String(h.account_id ?? ""));
  const [amount, setAmount] = useState(String(h.amount ?? ""));

  const [paidThroughId, setPaidThroughId] = useState(String(h.paid_through_account_id ?? ""));
  const [vendorId, setVendorId] = useState(String(h.vendor_id ?? ""));
  const [taxTreatment, setTaxTreatment] = useState(String(h.tax_treatment ?? "non_vat_registered"));
  const [placeOfSupply, setPlaceOfSupply] = useState(String(h.place_of_supply ?? defaultPlaceOfSupply ?? ""));
  const [reverseCharge, setReverseCharge] = useState(Boolean(h.reverse_charge));
  const [taxRateId, setTaxRateId] = useState(String(h.tax_rate_id ?? ""));
  const [referenceNumber, setReferenceNumber] = useState(String(h.reference_number ?? ""));
  const [notes, setNotes] = useState(String(h.notes ?? ""));
  const [customerId, setCustomerId] = useState(String(h.customer_id ?? ""));

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<"save" | "saveAndNew" | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  // tax_amount is always derived from the chosen tax rate — there's no separate input for it
  // anywhere on this screen (matches the reference screenshot: picking a Tax is the only tax
  // control). Recomputes whenever the amount or the chosen rate changes; clears to 0 when no
  // tax is selected.
  const taxAmount = useMemo(() => {
    const rate = taxRateOptions.find((t) => t.value === taxRateId)?.rate ?? 0;
    const amt = parseFloat(amount) || 0;
    return round2((amt * rate) / 100);
  }, [amount, taxRateId, taxRateOptions]);

  // Same {value,label} shape as BillForm.tsx's per-line Tax Combobox — the Tax field here used
  // to be a plain native <select> (2026-09-15: "show tax as dropdown list on expenses creation
  // page"), now a searchable dropdown matching the one Bills already has. "No Tax" is a real,
  // explicit first option (value "") rather than relying on an unset Combobox's placeholder, so
  // Tax can be cleared back to none through the same search-and-click flow as picking one.
  const taxComboOptions = useMemo(
    () => [{ value: "", label: "No Tax" }, ...taxRateOptions.map((o) => ({ value: o.value, label: `${o.label} (${o.rate}%)` }))],
    [taxRateOptions]
  );

  // Same reshape RecordPaymentForm.tsx/RecordPaymentMadeForm.tsx use for their own grouped
  // "Deposit To"/"Paid Through" pickers — see BankAccountOption above.
  const groupedBankOptions = useMemo(
    () => bankOptions.map((a) => ({ value: a.value, label: a.label, group: depositToGroupLabel(a.glAccountType) })),
    [bankOptions]
  );

  function resetForm() {
    setExpenseDate(new Date().toISOString().slice(0, 10));
    setAccountId("");
    setAmount("");
    setPaidThroughId("");
    setVendorId("");
    setTaxTreatment("non_vat_registered");
    setPlaceOfSupply(defaultPlaceOfSupply ?? "");
    setReverseCharge(false);
    setTaxRateId("");
    setReferenceNumber("");
    setNotes("");
    setCustomerId("");
    setPendingFiles([]);
  }

  async function save(mode: "save" | "saveAndNew") {
    setError(null);
    if (!expenseDate) return setError("Date is required.");
    if (!accountId) return setError("Expense Account is required.");
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return setError("Amount must be greater than 0.");
    if (!paidThroughId) return setError("Paid Through is required.");
    if (!placeOfSupply) return setError("Place of Supply is required.");

    setSaving(mode);
    const url = recordId ? `/api/entities/expenses/${recordId}` : `/api/entities/expenses`;
    const method = recordId ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        expense_date: expenseDate,
        account_id: accountId,
        amount: amt,
        paid_through_account_id: paidThroughId,
        vendor_id: vendorId || null,
        tax_treatment: taxTreatment,
        place_of_supply: placeOfSupply,
        reverse_charge: reverseCharge,
        tax_rate_id: taxRateId || null,
        tax_amount: taxAmount,
        reference_number: referenceNumber,
        notes,
        customer_id: customerId || null,
      }),
    });
    if (!res.ok) {
      setSaving(null);
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === "string" ? data.error : "Could not save this expense.");
      return;
    }
    const data = await res.json();
    const newId = data.row?.id as string | undefined;
    if (!recordId && newId && pendingFiles.length > 0) {
      const errors = await uploadPendingAttachments("expenses", newId, pendingFiles);
      if (errors.length > 0) alert(`Saved, but some files didn't upload:\n${errors.join("\n")}`);
    }
    setSaving(null);

    if (mode === "saveAndNew") {
      resetForm();
      router.refresh();
      return;
    }
    router.push(`/expenses/${recordId ?? newId}`);
    router.refresh();
  }

  return (
    <form onSubmit={(e) => e.preventDefault()} className="space-y-6">
      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="card overflow-hidden p-0">
        <div className="grid grid-cols-1 gap-4 bg-gray-50 p-6 sm:grid-cols-[10rem_1fr]">
          <label className="label pt-1.5 text-red-500">
            Date<span> *</span>
          </label>
          <input type="date" className="input max-w-xs" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} />

          <label className="label pt-1.5 text-red-500">
            Expense Account<span> *</span>
          </label>
          <div>
            <select className="input max-w-xs" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Select an account</option>
              {accountOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-400" title="Splitting one expense across several accounts isn't available yet">
              Itemize
            </p>
          </div>

          <label className="label pt-1.5 text-red-500">
            Amount<span> *</span>
          </label>
          <div className="flex max-w-xs">
            <span className="flex items-center rounded-l-md border border-r-0 border-gray-300 bg-white px-3 text-sm text-gray-500">
              {currency}
            </span>
            <input
              className="input rounded-l-none"
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 p-6 sm:grid-cols-[10rem_1fr] sm:items-start">
          <label className="label pt-1.5 text-red-500">
            Paid Through<span> *</span>
          </label>
          <div className="max-w-xs">
            <GroupedCombobox
              options={groupedBankOptions}
              value={paidThroughId}
              onChange={setPaidThroughId}
              placeholder="Select an account"
              searchPlaceholder="Search"
            />
          </div>

          <label className="label pt-1.5">Vendor</label>
          <select className="input max-w-xs" value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
            <option value="">Select a vendor</option>
            {vendorOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          <label className="label pt-1.5 text-red-500">
            Tax Treatment<span> *</span>
          </label>
          <select className="input max-w-xs" value={taxTreatment} onChange={(e) => setTaxTreatment(e.target.value)}>
            {TAX_TREATMENTS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          <label className="label pt-1.5 text-red-500">
            Place of Supply<span> *</span>
          </label>
          <select className="input max-w-xs" value={placeOfSupply} onChange={(e) => setPlaceOfSupply(e.target.value)}>
            <option value="">Select an Emirate</option>
            {EMIRATES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          <label className="label pt-1.5">Reverse Charge</label>
          <label className="flex items-start gap-2 text-sm text-ink-800">
            <input
              type="checkbox"
              checked={reverseCharge}
              onChange={(e) => setReverseCharge(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
            />
            <span>
              This transaction is applicable for Domestic Reverse Charge (DRC)
              <br />
              <span className="text-xs text-gray-400">Recorded as a flag only — doesn&apos;t post a self-assessed VAT entry.</span>
            </span>
          </label>

          <label className="label pt-1.5">Tax</label>
          <div className="max-w-xs">
            <Combobox options={taxComboOptions} value={taxRateId} onChange={setTaxRateId} placeholder="Select a Tax" />
          </div>

          <label className="label pt-1.5">Reference#</label>
          <input className="input max-w-xs" value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} />

          <label className="label pt-1.5">Notes</label>
          <textarea
            className="input max-w-md"
            rows={3}
            maxLength={500}
            placeholder="Max. 500 characters"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />

          <div className="col-span-full border-t border-gray-100 pt-4" />

          <label className="label pt-1.5">Customer Name</label>
          <select className="input max-w-xs" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">Select or add a customer</option>
            {customerOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          {!recordId && (
            <>
              <label className="label pt-1.5">Receipts</label>
              <AttachmentsField entityType="expenses" entityId={null} pendingFiles={pendingFiles} onPendingFilesChange={setPendingFiles} label="" />
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button type="button" disabled={saving !== null} onClick={() => save("save")} className="btn-primary">
          {saving === "save" ? "Saving..." : "Save"}
        </button>
        {!recordId && (
          <button type="button" disabled={saving !== null} onClick={() => save("saveAndNew")} className="btn-secondary">
            {saving === "saveAndNew" ? "Saving..." : "Save and New"}
          </button>
        )}
        <button type="button" onClick={() => router.push(recordId ? `/expenses/${recordId}` : "/expenses")} className="btn-secondary">
          Cancel
        </button>
      </div>
    </form>
  );
}
