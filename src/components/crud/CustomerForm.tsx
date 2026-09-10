"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, Plus, Trash2 } from "lucide-react";
import type { SelectOption } from "@/lib/entities";
import AttachmentsField from "@/components/attachments/AttachmentsField";
import { uploadPendingAttachments } from "@/lib/attachments-client";

const SALUTATIONS = ["Mr.", "Mrs.", "Ms.", "Dr.", "Miss"];
const COUNTRY_CODES = ["+971", "+1", "+44", "+91", "+92", "+61", "+65"];
const CURRENCIES = ["AED", "USD", "EUR", "GBP", "INR"];
const PAYMENT_TERMS: SelectOption[] = [
  { label: "Due on Receipt", value: "due_on_receipt" },
  { label: "Net 15", value: "net_15" },
  { label: "Net 30", value: "net_30" },
  { label: "Net 45", value: "net_45" },
  { label: "Net 60", value: "net_60" },
];

interface ContactRow {
  key: string;
  salutation: string;
  first_name: string;
  last_name: string;
  email: string;
  work_phone: string;
  mobile: string;
  designation: string;
  department: string;
}

let seq = 0;
function newContact(): ContactRow {
  seq += 1;
  return {
    key: `contact-${seq}`,
    salutation: "",
    first_name: "",
    last_name: "",
    email: "",
    work_phone: "",
    mobile: "",
    designation: "",
    department: "",
  };
}

function splitPhone(value: string) {
  const match = COUNTRY_CODES.find((code) => value.startsWith(code + " "));
  if (match) return { code: match, number: value.slice(match.length + 1) };
  return { code: "+971", number: value };
}

function PhoneInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const { code, number } = splitPhone(value);
  return (
    <div>
      <label className="label">{label}</label>
      <div className="flex gap-1.5">
        <select
          className="input w-24 shrink-0"
          value={code}
          onChange={(e) => onChange(number ? `${e.target.value} ${number}` : "")}
        >
          {COUNTRY_CODES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <input
          className="input"
          value={number}
          placeholder={label}
          onChange={(e) => onChange(e.target.value ? `${code} ${e.target.value}` : "")}
        />
      </div>
    </div>
  );
}

const TABS = ["Other Details", "Address", "Contact Persons", "Custom Fields", "Reporting Tags", "Remarks"] as const;
type Tab = (typeof TABS)[number];

interface Props {
  accountOptions: SelectOption[];
  initial?: {
    header: Record<string, unknown>;
    contacts: ContactRow[];
  } | null;
  recordId?: string;
}

export default function CustomerForm({ accountOptions, initial, recordId }: Props) {
  const router = useRouter();
  const h = initial?.header ?? {};

  const [customerType, setCustomerType] = useState<string>(String(h.customer_type ?? "business"));
  const [salutation, setSalutation] = useState<string>(String(h.salutation ?? ""));
  const [firstName, setFirstName] = useState<string>(String(h.first_name ?? ""));
  const [lastName, setLastName] = useState<string>(String(h.last_name ?? ""));
  const [companyName, setCompanyName] = useState<string>(String(h.company_name ?? ""));
  const [displayName, setDisplayName] = useState<string>(String(h.display_name ?? ""));
  const [secondaryDisplayName, setSecondaryDisplayName] = useState<string>(String(h.secondary_display_name ?? ""));
  const [email, setEmail] = useState<string>(String(h.email ?? ""));
  const [workPhone, setWorkPhone] = useState<string>(String(h.work_phone ?? ""));
  const [mobile, setMobile] = useState<string>(String(h.mobile ?? ""));
  const [language, setLanguage] = useState<string>(String(h.language ?? "English"));

  const [currency, setCurrency] = useState<string>(String(h.currency ?? "AED"));
  const [accountsReceivable, setAccountsReceivable] = useState<string>(
    String(h.accounts_receivable_account_id ?? "")
  );
  const [openingBalance, setOpeningBalance] = useState<string>(String(h.opening_balance ?? "0"));
  const [paymentTerms, setPaymentTerms] = useState<string>(String(h.payment_terms ?? "due_on_receipt"));
  const [portalEnabled, setPortalEnabled] = useState<boolean>(Boolean(h.portal_enabled));

  const [billingAddress, setBillingAddress] = useState<string>(String(h.billing_address ?? ""));
  const [shippingAddress, setShippingAddress] = useState<string>(String(h.shipping_address ?? ""));
  const [remarks, setRemarks] = useState<string>(String(h.remarks ?? ""));
  const [isActive, setIsActive] = useState<boolean>(h.is_active === undefined ? true : Boolean(h.is_active));

  const [contacts, setContacts] = useState<ContactRow[]>(
    initial?.contacts?.length ? initial.contacts : []
  );

  const [tab, setTab] = useState<Tab>("Other Details");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  const displayNameSuggestions = useMemo(() => {
    const options = new Set<string>();
    if (companyName.trim()) options.add(companyName.trim());
    const full = `${firstName} ${lastName}`.trim();
    if (full) options.add(full);
    return Array.from(options);
  }, [companyName, firstName, lastName]);

  function updateContact(key: string, patch: Partial<ContactRow>) {
    setContacts((prev) => prev.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!displayName.trim()) {
      setError("Display Name is required.");
      return;
    }
    setSaving(true);
    const url = recordId ? `/api/customers/${recordId}` : `/api/customers`;
    const method = recordId ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        header: {
          customer_type: customerType,
          salutation,
          first_name: firstName,
          last_name: lastName,
          company_name: companyName,
          display_name: displayName,
          secondary_display_name: secondaryDisplayName,
          email,
          work_phone: workPhone,
          mobile,
          language,
          currency,
          accounts_receivable_account_id: accountsReceivable || null,
          opening_balance: parseFloat(openingBalance) || 0,
          payment_terms: paymentTerms,
          portal_enabled: portalEnabled,
          billing_address: billingAddress,
          shipping_address: shippingAddress,
          remarks,
          is_active: isActive,
        },
        contacts: contacts.map(({ key, ...rest }) => rest),
      }),
    });
    if (!res.ok) {
      setSaving(false);
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === "string" ? data.error : "Something went wrong.");
      return;
    }
    const data = await res.json();
    if (!recordId && pendingFiles.length > 0 && data.id) {
      // Same pattern as EntityForm.tsx/DocumentForm.tsx: the customer is already saved, so
      // an attachment failure surfaces via alert() rather than blocking the redirect.
      const errors = await uploadPendingAttachments("customers", data.id, pendingFiles);
      if (errors.length > 0) alert(`Saved, but some files didn't upload:\n${errors.join("\n")}`);
    }
    setSaving(false);
    router.push("/customers");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="card space-y-4 p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[10rem_1fr]">
          <label className="label pt-1.5">Customer Type</label>
          <div className="flex items-center gap-6">
            {[
              { value: "business", label: "Business" },
              { value: "individual", label: "Individual" },
            ].map((opt) => (
              <label key={opt.value} className="flex items-center gap-2 text-sm text-ink-800">
                <input
                  type="radio"
                  name="customer_type"
                  checked={customerType === opt.value}
                  onChange={() => setCustomerType(opt.value)}
                  className="h-4 w-4 border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                {opt.label}
              </label>
            ))}
          </div>

          <label className="label pt-1.5">Primary Contact</label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[8rem_1fr_1fr]">
            <select className="input" value={salutation} onChange={(e) => setSalutation(e.target.value)}>
              <option value="">Salutation</option>
              {SALUTATIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <input className="input" placeholder="First Name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            <input className="input" placeholder="Last Name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>

          <label className="label pt-1.5">Company Name</label>
          <input className="input" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />

          <label className="label pt-1.5 text-red-500">
            Display Name<span> *</span>
          </label>
          <div>
            <p className="mb-1 text-xs text-gray-400">In Primary Language</p>
            <input
              className="input"
              list="display-name-suggestions"
              value={displayName}
              placeholder="Select or type to add"
              onChange={(e) => setDisplayName(e.target.value)}
            />
            <datalist id="display-name-suggestions">
              {displayNameSuggestions.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
            <p className="mb-1 mt-3 text-xs text-gray-400">In Secondary Language (Arabic)</p>
            <input
              className="input"
              dir="rtl"
              value={secondaryDisplayName}
              onChange={(e) => setSecondaryDisplayName(e.target.value)}
            />
          </div>

          <label className="label pt-1.5">Email Address</label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
            <input className="input pl-8" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>

          <label className="label pt-1.5">Phone</label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <PhoneInput label="Work Phone" value={workPhone} onChange={setWorkPhone} />
            <PhoneInput label="Mobile" value={mobile} onChange={setMobile} />
          </div>

          <label className="label pt-1.5">Customer Language</label>
          <select className="input max-w-xs" value={language} onChange={(e) => setLanguage(e.target.value)}>
            <option value="English">English</option>
            <option value="Arabic">Arabic</option>
          </select>

          <label className="label pt-1.5">Active</label>
          <label className="flex items-center gap-2 text-sm text-ink-800">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
            />
            This customer is active
          </label>
        </div>
      </div>

      <div className="card p-0">
        <div className="flex gap-6 overflow-x-auto border-b border-gray-200 px-6">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`whitespace-nowrap border-b-2 py-3 text-sm font-medium ${
                tab === t ? "border-brand-600 text-brand-700" : "border-transparent text-gray-500 hover:text-ink-700"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="p-6">
          {tab === "Other Details" && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[10rem_1fr] sm:items-start">
              <label className="label pt-1.5">Currency</label>
              <select className="input max-w-xs" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>

              <label className="label pt-1.5">Accounts Receivable</label>
              <select
                className="input max-w-xs"
                value={accountsReceivable}
                onChange={(e) => setAccountsReceivable(e.target.value)}
              >
                <option value="">Select an account</option>
                {accountOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>

              <label className="label pt-1.5">Opening Balance</label>
              <div className="flex max-w-xs">
                <span className="flex items-center rounded-l-md border border-r-0 border-gray-300 bg-gray-50 px-3 text-sm text-gray-500">
                  {currency}
                </span>
                <input
                  className="input rounded-l-none"
                  type="number"
                  step="0.01"
                  value={openingBalance}
                  onChange={(e) => setOpeningBalance(e.target.value)}
                />
              </div>

              <label className="label pt-1.5">Payment Terms</label>
              <select className="input max-w-xs" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)}>
                {PAYMENT_TERMS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>

              <label className="label pt-1.5">Enable Portal?</label>
              <label className="flex items-center gap-2 text-sm text-ink-800">
                <input
                  type="checkbox"
                  checked={portalEnabled}
                  onChange={(e) => setPortalEnabled(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                Allow portal access for this customer
              </label>

              <label className="label pt-1.5">Documents</label>
              <div>
                <AttachmentsField
                  entityType="customers"
                  entityId={recordId ?? null}
                  pendingFiles={pendingFiles}
                  onPendingFilesChange={setPendingFiles}
                  label=""
                />
              </div>
            </div>
          )}

          {tab === "Address" && (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="label">Billing Address</label>
                </div>
                <textarea className="input" rows={5} value={billingAddress} onChange={(e) => setBillingAddress(e.target.value)} />
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="label">Shipping Address</label>
                  <button
                    type="button"
                    onClick={() => setShippingAddress(billingAddress)}
                    className="text-xs font-medium text-brand-600 hover:underline"
                  >
                    Copy billing address
                  </button>
                </div>
                <textarea className="input" rows={5} value={shippingAddress} onChange={(e) => setShippingAddress(e.target.value)} />
              </div>
            </div>
          )}

          {tab === "Contact Persons" && (
            <div>
              <div className="mb-3 flex justify-end">
                <button type="button" onClick={() => setContacts((prev) => [...prev, newContact()])} className="btn-secondary py-1 text-xs">
                  <Plus size={14} /> Add Contact Person
                </button>
              </div>
              {contacts.length === 0 ? (
                <p className="py-10 text-center text-sm text-gray-400">No additional contact persons added.</p>
              ) : (
                <div className="space-y-4">
                  {contacts.map((c) => (
                    <div key={c.key} className="rounded-md border border-gray-200 p-4">
                      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-[7rem_1fr_1fr]">
                        <select className="input" value={c.salutation} onChange={(e) => updateContact(c.key, { salutation: e.target.value })}>
                          <option value="">Salutation</option>
                          {SALUTATIONS.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                        <input className="input" placeholder="First Name" value={c.first_name} onChange={(e) => updateContact(c.key, { first_name: e.target.value })} />
                        <input className="input" placeholder="Last Name" value={c.last_name} onChange={(e) => updateContact(c.key, { last_name: e.target.value })} />
                      </div>
                      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <input className="input" type="email" placeholder="Email" value={c.email} onChange={(e) => updateContact(c.key, { email: e.target.value })} />
                        <input className="input" placeholder="Designation" value={c.designation} onChange={(e) => updateContact(c.key, { designation: e.target.value })} />
                      </div>
                      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <input className="input" placeholder="Work Phone" value={c.work_phone} onChange={(e) => updateContact(c.key, { work_phone: e.target.value })} />
                        <input className="input" placeholder="Mobile" value={c.mobile} onChange={(e) => updateContact(c.key, { mobile: e.target.value })} />
                        <input className="input" placeholder="Department" value={c.department} onChange={(e) => updateContact(c.key, { department: e.target.value })} />
                      </div>
                      <button
                        type="button"
                        onClick={() => setContacts((prev) => prev.filter((row) => row.key !== c.key))}
                        className="flex items-center gap-1 text-xs font-medium text-red-600 hover:underline"
                      >
                        <Trash2 size={13} /> Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === "Custom Fields" && (
            <p className="py-10 text-center text-sm text-gray-400">
              Custom fields aren&apos;t configurable yet in this build.
            </p>
          )}

          {tab === "Reporting Tags" && (
            <p className="py-10 text-center text-sm text-gray-400">
              Reporting tags aren&apos;t configurable yet in this build.
            </p>
          )}

          {tab === "Remarks" && (
            <textarea
              className="input"
              rows={5}
              placeholder="Add any internal notes about this customer..."
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
            />
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? "Saving..." : recordId ? "Save Changes" : "Save"}
        </button>
        <button type="button" onClick={() => router.push("/customers")} className="btn-secondary">
          Cancel
        </button>
      </div>
    </form>
  );
}
