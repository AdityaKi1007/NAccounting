import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Pencil, Mail, Phone, Users as UsersIcon, Receipt, Plus } from "lucide-react";
import { requireActiveContext } from "@/lib/session";
import { requireModuleAccess } from "@/lib/module-access";
import { query, queryOne } from "@/lib/db";
import { getOrgLogoDataUri } from "@/lib/s3";
import { getEntity } from "@/lib/entities";
import { formatCurrency, formatDate, titleCase, toDateInputValue } from "@/lib/format";
import AttachmentsField from "@/components/attachments/AttachmentsField";
import EmailsList from "@/components/emails/EmailsList";
import DetailTabs from "@/components/ui/DetailTabs";
import CustomerStatementView, { type ARStatementEvent } from "@/components/customers/CustomerStatementView";

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
  opening_balance: number | string;
  crm_customer_no: string | null;
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

interface QuoteRow {
  id: string;
  quote_number: string;
  quote_date: string;
  status: string;
  total: number | string;
}

interface SalesOrderRow {
  id: string;
  so_number: string;
  order_date: string;
  status: string;
  total: number | string;
}

interface ChallanRow {
  id: string;
  challan_number: string;
  challan_date: string;
  status: string;
}

interface RecurringInvoiceRow {
  id: string;
  profile_name: string;
  next_invoice_date: string | null;
  amount: number | string;
  status: string;
}

interface ExpenseRow {
  id: string;
  expense_date: string;
  reference_number: string | null;
  amount: number | string;
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

/** One grouped mini-table on the Transactions tab (Invoices, Customer Payments, Quotes, Sales
 * Orders, Delivery Challans, Recurring Invoices, Expenses — mirrors the reference
 * screenshot's per-document-type sections). `amount`/`status` are optional per-row because
 * Delivery Challans have neither a dollar amount nor the same status vocabulary. */
function TransactionGroupCard({
  title,
  newHref,
  rows,
  showAmount = true,
  showStatus = true,
  currency,
}: {
  title: string;
  newHref: string;
  rows: { id: string; href: string; number: string; date: string; amount?: number; status?: string }[];
  showAmount?: boolean;
  showStatus?: boolean;
  currency: string;
}) {
  return (
    <div className="card p-0">
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
        <h2 className="text-sm font-semibold text-ink-800">{title}</h2>
        <Link href={newHref} className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">
          <Plus size={12} /> New
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-6 text-sm text-gray-400">No {title.toLowerCase()} yet for this customer.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-5 py-2">Number</th>
                <th className="px-5 py-2">Date</th>
                {showAmount && <th className="px-5 py-2 text-right">Amount</th>}
                {showStatus && <th className="px-5 py-2">Status</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-5 py-2.5">
                    <Link href={r.href} className="font-medium text-brand-600 hover:underline">
                      {r.number}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-5 py-2.5 text-ink-700">{formatDate(r.date)}</td>
                  {showAmount && (
                    <td className="whitespace-nowrap px-5 py-2.5 text-right text-ink-800">
                      {r.amount != null ? formatCurrency(r.amount, currency) : "-"}
                    </td>
                  )}
                  {showStatus && (
                    <td className="whitespace-nowrap px-5 py-2.5">
                      {r.status ? <StatusPill label={titleCase(r.status)} tone={txnStatusTone(r.status)} /> : "-"}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default async function CustomerDetailPage({ params }: { params: { id: string } }) {
  const ctx = await requireActiveContext();
  await requireModuleAccess(ctx, "customers", "view");

  const customer = await queryOne<CustomerRow>(
    `SELECT id, customer_type, display_name, secondary_display_name, company_name, email, work_phone, mobile,
            language, currency, billing_address, shipping_address, payment_terms, portal_enabled, is_active,
            remarks, opening_balance, crm_customer_no, created_at
     FROM customers WHERE id = $1 AND organization_id = $2`,
    [params.id, ctx.orgId]
  );
  if (!customer) notFound();

  const [contacts, invoices, payments, creditNotes, debitNotes, quotes, salesOrders, challans, recurringInvoices, expenses] =
    await Promise.all([
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
      query<QuoteRow>(
        `SELECT id, quote_number, quote_date, status, total
       FROM quotes WHERE customer_id = $1 AND organization_id = $2 ORDER BY quote_date DESC`,
        [params.id, ctx.orgId]
      ),
      query<SalesOrderRow>(
        `SELECT id, so_number, order_date, status, total
       FROM sales_orders WHERE customer_id = $1 AND organization_id = $2 ORDER BY order_date DESC`,
        [params.id, ctx.orgId]
      ),
      query<ChallanRow>(
        `SELECT id, challan_number, challan_date, status
       FROM delivery_challans WHERE customer_id = $1 AND organization_id = $2 ORDER BY challan_date DESC`,
        [params.id, ctx.orgId]
      ),
      query<RecurringInvoiceRow>(
        `SELECT id, profile_name, next_invoice_date, amount, status
       FROM recurring_invoices WHERE customer_id = $1 AND organization_id = $2 ORDER BY created_at DESC`,
        [params.id, ctx.orgId]
      ),
      query<ExpenseRow>(
        `SELECT id, expense_date, reference_number, amount
       FROM expenses WHERE customer_id = $1 AND organization_id = $2 ORDER BY expense_date DESC`,
        [params.id, ctx.orgId]
      ),
    ]);

  const customerEntity = getEntity("customers");
  const paymentTermsLabel =
    customerEntity?.fields.find((f) => f.name === "payment_terms")?.options?.find((o) => o.value === customer.payment_terms)?.label ??
    titleCase(customer.payment_terms);

  // Outstanding receivables: same posted-revenue boundary the AR Aging / Sales reports use
  // (draft and void invoices never represent a real receivable), starting from whatever
  // opening balance was carried in when this customer was set up.
  const openingBalanceNum = Number(customer.opening_balance) || 0;
  const outstandingReceivables =
    openingBalanceNum +
    invoices.filter((inv) => !["draft", "void"].includes(inv.status)).reduce((sum, inv) => sum + Number(inv.balance_due), 0);

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

  const org = await queryOne<{
    name: string;
    currency: string;
    address_street1: string | null;
    address_street2: string | null;
    address_city: string | null;
    address_state: string | null;
    location_country: string | null;
  }>(
    `SELECT name, currency, address_street1, address_street2, address_city, address_state, location_country
     FROM organizations WHERE id = $1`,
    [ctx.orgId]
  );
  const orgCurrency = org?.currency ?? customer.currency ?? "AED";
  const orgAddressLines = [org?.address_street1, org?.address_street2, org?.address_city, org?.address_state, org?.location_country].filter(
    (v): v is string => Boolean(v && v.trim())
  );
  const logoDataUri = await getOrgLogoDataUri(ctx.orgId);

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

  // Statement of Accounts ledger — every event that actually moves the AR balance, signed
  // relative to that balance (Invoice/Debit Note +, Payment Received/Credit Note -). Filtered
  // to the same "posted" statuses the Outstanding Receivables figure above and the AR Aging
  // report use, so the Statement's own running balance always agrees with it: non-draft/void
  // invoices, non-draft payments (a draft payment was never actually received), non-void
  // credit/debit notes. The FULL history is passed down (not pre-limited to one period) so
  // CustomerStatementView can recompute "Opening Balance as of period start" for whatever
  // date range the user picks, entirely client-side.
  // NOTE: pg returns DATE columns as JS Date objects, not strings (confirmed directly against
  // this table — see the known-issues doc). CustomerStatementView compares these dates
  // against plain "YYYY-MM-DD" strings from <input type="date"> to bucket events into
  // pre-period/in-period, so every date has to be normalized to that same string form here —
  // otherwise a Date-vs-string relational comparison silently coerces the string operand with
  // ToNumber (NaN for "2026-09-01"), every comparison against NaN is false, and an event
  // vanishes from BOTH buckets instead of landing in either one. Bit this exact way while
  // testing against a real invoice that should have shown up in "This Month" and didn't.
  const statementEvents: ARStatementEvent[] = [
    ...invoices
      .filter((inv) => !["draft", "void"].includes(inv.status))
      .map((inv): ARStatementEvent => ({
        key: `inv-${inv.id}`,
        date: toDateInputValue(inv.invoice_date),
        type: "Invoice",
        refNumber: inv.invoice_number,
        href: `/invoices/${inv.id}`,
        amount: Number(inv.total),
      })),
    ...payments
      .filter((p) => p.status !== "draft")
      .map((p): ARStatementEvent => ({
        key: `pmt-${p.id}`,
        date: toDateInputValue(p.payment_date),
        type: "Payment Received",
        refNumber: p.payment_number,
        href: `/payments-received/${p.id}`,
        amount: -Number(p.amount),
      })),
    ...creditNotes
      .filter((c) => c.status !== "void")
      .map((c): ARStatementEvent => ({
        key: `cn-${c.id}`,
        date: toDateInputValue(c.date),
        type: "Credit Note",
        refNumber: c.number,
        href: `/credit-notes/${c.id}`,
        amount: -Number(c.total),
      })),
    ...debitNotes
      .filter((d) => d.status !== "void")
      .map((d): ARStatementEvent => ({
        key: `dn-${d.id}`,
        date: toDateInputValue(d.date),
        type: "Debit Note",
        refNumber: d.number,
        href: `/debit-notes/${d.id}`,
        amount: Number(d.total),
      })),
  ];

  const initial = (customer.company_name || customer.display_name || "?").trim().charAt(0).toUpperCase();
  const customerAddressLines = customer.billing_address?.split("\n").filter(Boolean) ?? [];

  const overviewContent = (
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
            <Field label="CRM Customer No" value={customer.crm_customer_no || "-"} />
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
          <h2 className="text-sm font-semibold text-ink-800">Emails</h2>
          <EmailsList partyType="customer" partyId={customer.id} />
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
          <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3">
            <span className="text-sm text-ink-700">
              Opening Balance <span className="ml-1 font-semibold text-ink-800">{formatCurrency(openingBalanceNum, orgCurrency)}</span>
            </span>
            <Link href={`/customers/${customer.id}/edit`} className="text-sm text-brand-600 hover:underline">
              Edit
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
  );

  // Transactions tab — grouped per-document-type sections, matching the reference
  // screenshot's layout. Recurring Expenses and Property Master Projects are deliberately
  // NOT included: recurring_expenses only has a vendor_id (no customer relationship exists in
  // this schema at all), and Projects are org-scoped, not customer-scoped — see the schema
  // dump in this project's known-issues doc for how that was confirmed. "+ New" links go to
  // each type's own /new route without pre-filling this customer (a disclosed simplification
  // — none of these forms currently accept a customer via query string).
  const transactionsContent = (
    <div className="space-y-6 p-6">
      <TransactionGroupCard
        title="Invoices"
        newHref="/invoices/new"
        currency={orgCurrency}
        rows={invoices.map((inv) => ({
          id: inv.id,
          href: `/invoices/${inv.id}`,
          number: inv.invoice_number,
          date: inv.invoice_date,
          amount: Number(inv.total),
          status: inv.status,
        }))}
      />
      <TransactionGroupCard
        title="Customer Payments"
        newHref="/payments-received/new"
        currency={orgCurrency}
        rows={payments.map((p) => ({
          id: p.id,
          href: `/payments-received/${p.id}`,
          number: p.payment_number,
          date: p.payment_date,
          amount: Number(p.amount),
          status: p.status,
        }))}
      />
      <TransactionGroupCard
        title="Quotes"
        newHref="/quotes/new"
        currency={orgCurrency}
        rows={quotes.map((q) => ({
          id: q.id,
          href: `/quotes/${q.id}`,
          number: q.quote_number,
          date: q.quote_date,
          amount: Number(q.total),
          status: q.status,
        }))}
      />
      <TransactionGroupCard
        title="Sales Orders"
        newHref="/sales-orders/new"
        currency={orgCurrency}
        rows={salesOrders.map((so) => ({
          id: so.id,
          href: `/sales-orders/${so.id}`,
          number: so.so_number,
          date: so.order_date,
          amount: Number(so.total),
          status: so.status,
        }))}
      />
      <TransactionGroupCard
        title="Delivery Challans"
        newHref="/delivery-challans/new"
        currency={orgCurrency}
        showAmount={false}
        rows={challans.map((c) => ({
          id: c.id,
          href: `/delivery-challans/${c.id}`,
          number: c.challan_number,
          date: c.challan_date,
          status: c.status,
        }))}
      />
      <TransactionGroupCard
        title="Recurring Invoices"
        newHref="/recurring-invoices/new"
        currency={orgCurrency}
        rows={recurringInvoices.map((r) => ({
          id: r.id,
          href: `/recurring-invoices/${r.id}`,
          number: r.profile_name,
          date: r.next_invoice_date ?? "",
          amount: Number(r.amount),
          status: r.status,
        }))}
      />
      <TransactionGroupCard
        title="Expenses"
        newHref="/expenses/new"
        currency={orgCurrency}
        rows={expenses.map((e) => ({
          id: e.id,
          href: `/expenses/${e.id}`,
          number: e.reference_number || formatDate(e.expense_date),
          date: e.expense_date,
          amount: Number(e.amount),
        }))}
      />
      <p className="text-xs text-gray-400">
        Recurring Expenses and Projects aren&apos;t shown here — this app&apos;s data model doesn&apos;t relate either one to a specific
        customer.
      </p>
    </div>
  );

  const statementContent = (
    <CustomerStatementView
      customerId={customer.id}
      customerName={customer.display_name}
      customerEmail={customer.email}
      customerAddressLines={customerAddressLines}
      openingBalance={openingBalanceNum}
      events={statementEvents}
      org={{ name: org?.name ?? "", addressLines: orgAddressLines, logoDataUri }}
      currency={orgCurrency}
    />
  );

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

      <DetailTabs
        tabs={[
          { key: "overview", label: "Overview", content: overviewContent },
          { key: "transactions", label: "Transactions", content: transactionsContent },
          { key: "statement", label: "Statement", content: statementContent },
        ]}
      />
    </div>
  );
}
