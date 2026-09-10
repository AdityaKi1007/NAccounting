import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Pencil, Mail, Phone, Users as UsersIcon, Receipt } from "lucide-react";
import { requireActiveContext } from "@/lib/session";
import { query, queryOne } from "@/lib/db";
import { getEntity } from "@/lib/entities";
import { formatCurrency, formatDate, titleCase } from "@/lib/format";
import AttachmentsField from "@/components/attachments/AttachmentsField";

interface CustomerRow {
  id: string;
  customer_type: string;
  display_name: string;
  secondary_display_name: string | null;
  company_name: string | null;
  email: string | null;
  work_phone: string | null;
  mobile: string | null;
  language: string;
  currency: string;
  billing_address: string | null;
  shipping_address: string | null;
  payment_terms: string;
  portal_enabled: boolean;
  is_active: boolean;
  remarks: string | null;
  created_at: string;
}

interface ContactRow {
  id: string;
  salutation: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  work_phone: string | null;
  mobile: string | null;
  designation: string | null;
  department: string | null;
}

interface InvoiceRow {
  id: string;
  invoice_number: string;
  invoice_date: string;
  status: string;
  total: number | string;
  balance_due: number | string;
}

interface PaymentRow {
  id: string;
  payment_number: string;
  payment_date: string;
  amount: number | string;
  status: string;
}

interface NoteRow {
  id: string;
  number: string;
  date: string;
  status: string;
  total: number | string;
}

type TxnRow = {
  key: string;
  kind: "Invoice" | "Payment Received" | "Credit Note" | "Debit Note";
  href: string;
  number: string;
  date: string;
  amount: number;
  status: string;
};

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-0.5 text-sm text-ink-700">{value || "-"}</p>
    </div>
  );
}

function txnStatusTone(status: string): "green" | "gray" | "amber" | "red" | "blue" {
  if (["paid", "closed"].includes(status)) return "green";
  if (["void", "overdue"].includes(status)) return "red";
  if (["draft"].includes(status)) return "gray";
  if (["partially_paid", "sent", "open"].includes(status)) return "amber";
  return "blue";
}

function StatusPill({ label, tone }: { label: string; tone: "green" | "gray" | "amber" | "red" | "blue" }) {
  const toneClass = {
    green: "bg-green-50 text-green-700",
    gray: "bg-gray-100 text-gray-600",
    amber: "bg-amber-50 text-amber-700",
    red: "bg-red-50 text-red-700",
    blue: "bg-blue-50 text-blue-700",
  }[tone];
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${toneClass}`}>{label}</span>;
}

export default async function CustomerDetailPage({ params }: { params: { id: string } }) {
  const ctx = await requireActiveContext();

  const customer = await queryOne<CustomerRow>(
    `SELECT id, customer_type, display_name, secondary_display_name, company_name, email, work_phone, mobile,
            language, currency, billing_address, shipping_address, payment_terms, portal_enabled, is_active,
            remarks, created_at
     FROM customers WHERE id = $1 AND organization_id = $2`,
    [params.id, ctx.orgId]
  );
  if (!customer) notFound();

  const [contacts, invoices, payments, creditNotes, debitNotes] = await Promise.all([
    query<ContactRow>(
      `SELECT id, salutation, first_name, last_name, email, work_phone, mobile, designation, department
       FROM customer_contacts WHERE customer_id = $1 ORDER BY created_at ASC`,
      [params.id]
    ),
    query<InvoiceRow>(
      `SELECT id, invoice_number, invoice_date, status, total, balance_due
       FROM invoices WHERE customer_id = $1 AND organization_id = $2 ORDER BY invoice_date DESC`,
      [params.id, ctx.orgId]
    ),
    query<PaymentRow>(
      `SELECT id, payment_number, payment_date, amount, status
       FROM payments_received WHERE customer_id = $1 AND organization_id = $2 ORDER BY payment_date DESC`,
      [params.id, ctx.orgId]
    ),
    query<NoteRow>(
      `SELECT id, credit_note_number AS number, credit_note_date AS date, status, total
       FROM credit_notes WHERE customer_id = $1 AND organization_id = $2 ORDER BY credit_note_date DESC`,
      [params.id, ctx.orgId]
    ),
    query<NoteRow>(
      `SELECT id, debit_note_number AS number, debit_note_date AS date, status, total
       FROM debit_notes WHERE customer_id = $1 AND organization_id = $2 ORDER BY debit_note_date DESC`,
      [params.id, ctx.orgId]
    ),
  ]);

  const customerEntity = getEntity("customers");
  const paymentTermsLabel =
    customerEntity?.fields.find((f) => f.name === "payment_terms")?.options?.find((o) => o.value === customer.payment_terms)?.label ??
    titleCase(customer.payment_terms);

  // Outstanding receivables: same posted-revenue boundary the AR Aging / Sales reports use
  // (draft and void invoices never represent a real receivable).
  const outstandingReceivables = invoices
    .filter((inv) => !["draft", "void"].includes(inv.status))
    .reduce((sum, inv) => sum + Number(inv.balance_due), 0);

  // Income chart: last 6 calendar months (including the current one), accrual basis — the
  // invoice's own date, not when it was paid — summing posted (non-draft, non-void) invoice
  // totals per month. This app has no multi-currency conversion, so (like every other report
  // in the app) the figures are the org's single ledger currency, not a converted amount.
  const now = new Date();
  const months: { key: string; label: string; total: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      key: `${d.getFullYear()}-${d.getMonth()}`,
      label: d.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
      total: 0,
    });
  }
  for (const inv of invoices) {
    if (["draft", "void"].includes(inv.status)) continue;
    const d = new Date(inv.invoice_date);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const bucket = months.find((m) => m.key === key);
    if (bucket) bucket.total += Number(inv.total);
  }
  const maxMonthTotal = Math.max(1, ...months.map((m) => m.total));
  const totalIncome6mo = months.reduce((sum, m) => sum + m.total, 0);

  const org = await queryOne<{ currency: string }>(`SELECT currency FROM organizations WHERE id = $1`, [ctx.orgId]);
  const orgCurrency = org?.currency ?? customer.currency ?? "AED";

  const transactions: TxnRow[] = [
    ...invoices.map((inv): TxnRow => ({
      key: `inv-${inv.id}`,
      kind: "Invoice",
      href: `/invoices/${inv.id}`,
      number: inv.invoice_number,
      date: inv.invoice_date,
      amount: Number(inv.total),
      status: inv.status,
    })),
    ...payments.map((p): TxnRow => ({
      key: `pmt-${p.id}`,
      kind: "Payment Received",
      href: `/payments-received/${p.id}`,
      number: p.payment_number,
      date: p.payment_date,
      amount: Number(p.amount),
      status: p.status,
    })),
    ...creditNotes.map((c): TxnRow => ({
      key: `cn-${c.id}`,
      kind: "Credit Note",
      href: `/credit-notes/${c.id}`,
      number: c.number,
      date: c.date,
      amount: Number(c.total),
      status: c.status,
    })),
    ...debitNotes.map((d): TxnRow => ({
      key: `dn-${d.id}`,
      kind: "Debit Note",
      href: `/debit-notes/${d.id}`,
      number: d.number,
      date: d.date,
      amount: Number(d.total),
      status: d.status,
    })),
  ].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const initial = (customer.company_name || customer.display_name || "?").trim().charAt(0).toUpperCase();

  return (
    <div>
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <Link href="/customers" className="mb-2 inline-flex items-center gap-1 text-xs text-gray-400 hover:text-brand-600">
          <ChevronLeft size={12} /> Customers
        </Link>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-ink-800">{customer.display_name}</h1>
            {!customer.is_active && <StatusPill label="Inactive" tone="gray" />}
          </div>
          <Link href={`/customers/${customer.id}/edit`} className="btn-secondary">
            <Pencil size={14} /> Edit
          </Link>
        </div>
      </div>

      {!customer.secondary_display_name && (
        <div className="border-b border-amber-100 bg-amber-50 px-6 py-2 text-xs text-amber-700">
          You have not added the Customer Name in the secondary language (Arabic).
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-[360px_1fr]">
        {/* Left column */}
        <div className="space-y-6">
          <div className="card space-y-3 p-5">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-100 text-base font-semibold text-brand-700">
                {initial}
              </span>
              <div>
                <p className="font-medium text-ink-800">{customer.display_name}</p>
                {customer.company_name && <p className="text-xs text-gray-500">{customer.company_name}</p>}
              </div>
            </div>
            {customer.email && (
              <p className="flex items-center gap-2 text-sm text-ink-700">
                <Mail size={14} className="text-gray-400" /> {customer.email}
              </p>
            )}
            {(customer.work_phone || customer.mobile) && (
              <p className="flex items-center gap-2 text-sm text-ink-700">
                <Phone size={14} className="text-gray-400" /> {customer.work_phone || customer.mobile}
              </p>
            )}
          </div>

          <div className="card space-y-4 p-5">
            <h2 className="text-sm font-semibold text-ink-800">Address</h2>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Billing Address</p>
              <p className="mt-0.5 whitespace-pre-wrap text-sm text-ink-700">{customer.billing_address || "-"}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Shipping Address</p>
              <p className="mt-0.5 whitespace-pre-wrap text-sm text-ink-700">{customer.shipping_address || "-"}</p>
            </div>
          </div>

          <div className="card space-y-4 p-5">
            <h2 className="text-sm font-semibold text-ink-800">Other Details</h2>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Customer Type" value={titleCase(customer.customer_type)} />
              <Field label="Default Currency" value={customer.currency} />
              <Field label="Portal Status" value={customer.portal_enabled ? "Enabled" : "Disabled"} />
              <Field label="Customer Language" value={customer.language} />
              <Field label="Payment Terms" value={paymentTermsLabel} />
            </div>
          </div>

          <div className="card space-y-3 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink-800">Contact Persons</h2>
            </div>
            {contacts.length === 0 ? (
              <p className="flex items-center gap-2 py-4 text-sm text-gray-400">
                <UsersIcon size={16} className="text-gray-300" /> No contact persons found.
              </p>
            ) : (
              <div className="space-y-3">
                {contacts.map((c) => {
                  const name = [c.salutation, c.first_name, c.last_name].filter(Boolean).join(" ");
                  return (
                    <div key={c.id} className="rounded-md border border-gray-100 p-3">
                      <p className="text-sm font-medium text-ink-800">{name || "-"}</p>
                      {(c.designation || c.department) && (
                        <p className="text-xs text-gray-500">{[c.designation, c.department].filter(Boolean).join(" · ")}</p>
                      )}
                      {c.email && <p className="mt-1 text-xs text-ink-600">{c.email}</p>}
                      {(c.work_phone || c.mobile) && <p className="text-xs text-ink-600">{c.work_phone || c.mobile}</p>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="card space-y-2 p-5">
            <h2 className="text-sm font-semibold text-ink-800">Documents</h2>
            <AttachmentsField entityType="customers" entityId={customer.id} label="" />
          </div>

          <div className="card space-y-2 p-5">
            <h2 className="text-sm font-semibold text-ink-800">Record Info</h2>
            <Field label="Created On" value={formatDate(customer.created_at)} />
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          <p className="text-sm text-gray-500">
            Payment due period <span className="ml-1 font-medium text-ink-700">{paymentTermsLabel}</span>
          </p>

          <div className="card p-0">
            <div className="border-b border-gray-100 px-5 py-3">
              <h2 className="text-sm font-semibold text-ink-800">Receivables</h2>
            </div>
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-5 py-2.5">Currency</th>
                  <th className="px-5 py-2.5 text-right">Outstanding Receivables</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="px-5 py-3 text-ink-700">{customer.currency} - {customer.currency === "AED" ? "UAE Dirham" : customer.currency}</td>
                  <td className="px-5 py-3 text-right text-ink-800">{formatCurrency(outstandingReceivables, orgCurrency)}</td>
                </tr>
              </tbody>
            </table>
            <div className="border-t border-gray-100 px-5 py-3">
              <Link href={`/customers/${customer.id}/edit`} className="text-sm text-brand-600 hover:underline">
                Enter Opening Balance
              </Link>
            </div>
          </div>

          <div className="card p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-ink-800">Income</h2>
                <p className="text-xs text-gray-400">Shown in the organization&apos;s base currency.</p>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span className="rounded-md bg-gray-100 px-2 py-1">Last 6 Months</span>
                <span className="rounded-md bg-gray-100 px-2 py-1">Accrual</span>
              </div>
            </div>
            <div className="flex items-end gap-4 border-b border-gray-100 pb-3" style={{ height: 140 }}>
              {months.map((m) => (
                <div key={m.key} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-xs text-gray-500">{m.total > 0 ? formatCurrency(m.total, orgCurrency) : ""}</span>
                  <div
                    className="w-full max-w-[36px] rounded-t bg-brand-500"
                    style={{ height: `${Math.max(4, (m.total / maxMonthTotal) * 90)}px` }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-2 flex gap-4">
              {months.map((m) => (
                <span key={m.key} className="flex-1 text-center text-xs text-gray-400">
                  {m.label}
                </span>
              ))}
            </div>
            <p className="mt-4 text-sm text-ink-700">
              Total Income (Last 6 Months) - <span className="font-semibold">{formatCurrency(totalIncome6mo, orgCurrency)}</span>
            </p>
          </div>

          <div className="card p-0">
            <div className="border-b border-gray-100 px-5 py-3">
              <h2 className="text-sm font-semibold text-ink-800">Recent Transactions</h2>
            </div>
            {transactions.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
                <Receipt size={26} className="text-gray-300" />
                <p className="text-sm text-gray-500">No transactions yet for this customer.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-5 py-2.5">Type</th>
                      <th className="px-5 py-2.5">Number</th>
                      <th className="px-5 py-2.5">Date</th>
                      <th className="px-5 py-2.5 text-right">Amount</th>
                      <th className="px-5 py-2.5">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {transactions.map((t) => (
                      <tr key={t.key} className="hover:bg-gray-50">
                        <td className="whitespace-nowrap px-5 py-2.5 text-ink-700">{t.kind}</td>
                        <td className="whitespace-nowrap px-5 py-2.5">
                          <Link href={t.href} className="font-medium text-brand-600 hover:underline">
                            {t.number}
                          </Link>
                        </td>
                        <td className="whitespace-nowrap px-5 py-2.5 text-ink-700">{formatDate(t.date)}</td>
                        <td className="whitespace-nowrap px-5 py-2.5 text-right text-ink-800">{formatCurrency(t.amount, orgCurrency)}</td>
                        <td className="whitespace-nowrap px-5 py-2.5">
                          <StatusPill label={titleCase(t.status)} tone={txnStatusTone(t.status)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
