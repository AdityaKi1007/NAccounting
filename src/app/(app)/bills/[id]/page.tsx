import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Pencil } from "lucide-react";
import { requireActiveContext } from "@/lib/session";
import { query, queryOne } from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/format";
import AttachmentsField from "@/components/attachments/AttachmentsField";
import JournalPanel, { type JournalLineData } from "@/components/accounting/JournalPanel";

interface BillRow {
  id: string;
  bill_number: string;
  vendor_id: string | null;
  bill_date: string;
  due_date: string | null;
  order_number: string | null;
  permit_number: string | null;
  subject: string | null;
  payment_terms: string;
  accounts_payable_account_id: string | null;
  status: string;
  subtotal: string;
  tax_total: string;
  total: string;
  balance_due: string;
  notes: string | null;
}

interface LineRow {
  id: string;
  item_id: string | null;
  description: string | null;
  quantity: string;
  rate: string;
  amount: string;
  account_id: string | null;
  account_name: string | null;
  tax_rate_id: string | null;
  tax_name: string | null;
  tax_rate: string | null;
  customer_id: string | null;
  customer_name: string | null;
}

interface PaymentRow {
  id: string;
  payment_number: string;
  payment_date: string;
  amount: string;
}

const STATUS_STYLES: Record<string, string> = {
  paid: "bg-emerald-100 text-emerald-700",
  partially_paid: "bg-amber-100 text-amber-700",
  open: "bg-blue-100 text-blue-700",
  overdue: "bg-red-100 text-red-700",
  draft: "bg-gray-100 text-gray-500",
};
const STATUS_LABELS: Record<string, string> = {
  paid: "Paid",
  partially_paid: "Partially Paid",
  open: "Open",
  overdue: "Overdue",
  draft: "Draft",
};
const PAYMENT_TERM_LABELS: Record<string, string> = {
  due_on_receipt: "Due on Receipt",
  net_15: "Net 15",
  net_30: "Net 30",
  net_45: "Net 45",
  net_60: "Net 60",
};

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-0.5 text-sm text-ink-700">{value || "-"}</p>
    </div>
  );
}

/** Read-only detail view at /bills/[id] — reached by clicking the Bill # from the list, or
 * right after Save (see BillForm.tsx). Same "click the account, land on its own ledger"
 * pattern the Expense detail view established: each item row's Account is a link to
 * /chart-of-accounts/[id], which already lists every journal line posted to it. */
export default async function BillDetailPage({ params }: { params: { id: string } }) {
  const ctx = await requireActiveContext();

  const bill = await queryOne<BillRow>(
    `SELECT id, bill_number, vendor_id, bill_date, due_date, order_number, permit_number, subject,
            payment_terms, accounts_payable_account_id, status, subtotal, tax_total, total, balance_due, notes
     FROM bills WHERE id = $1 AND organization_id = $2`,
    [params.id, ctx.orgId]
  );
  if (!bill) notFound();

  const [vendor, apAccount, org, lines, payments, journalLines] = await Promise.all([
    bill.vendor_id
      ? queryOne<{ id: string; display_name: string }>(`SELECT id, display_name FROM vendors WHERE id = $1 AND organization_id = $2`, [
          bill.vendor_id,
          ctx.orgId,
        ])
      : Promise.resolve(null),
    bill.accounts_payable_account_id
      ? queryOne<{ name: string }>(`SELECT name FROM accounts WHERE id = $1 AND organization_id = $2`, [
          bill.accounts_payable_account_id,
          ctx.orgId,
        ])
      : Promise.resolve(null),
    queryOne<{ currency: string }>(`SELECT currency FROM organizations WHERE id = $1`, [ctx.orgId]),
    query<LineRow>(
      `SELECT bi.id, bi.item_id, bi.description, bi.quantity, bi.rate, bi.amount,
              bi.account_id, a.name AS account_name,
              bi.tax_rate_id, tr.name AS tax_name, tr.rate AS tax_rate,
              bi.customer_id, c.display_name AS customer_name
       FROM bill_items bi
       LEFT JOIN accounts a ON a.id = bi.account_id
       LEFT JOIN tax_rates tr ON tr.id = bi.tax_rate_id
       LEFT JOIN customers c ON c.id = bi.customer_id
       WHERE bi.bill_id = $1
       ORDER BY bi.id ASC`,
      [bill.id]
    ),
    query<PaymentRow>(
      `SELECT pm.id, pm.payment_number, pm.payment_date, bpa.amount
       FROM bill_payment_allocations bpa
       JOIN payments_made pm ON pm.id = bpa.payment_made_id
       WHERE bpa.bill_id = $1
       ORDER BY pm.payment_date ASC`,
      [bill.id]
    ),
    query<{ account_id: string; account_name: string; debit: string; credit: string }>(
      `SELECT a.id AS account_id, a.name AS account_name, jl.debit, jl.credit
       FROM journal_lines jl
       JOIN manual_journals mj ON mj.id = jl.journal_id
       JOIN accounts a ON a.id = jl.account_id
       WHERE mj.bill_id = $1
       ORDER BY jl.id ASC`,
      [bill.id]
    ),
  ]);

  const currency = org?.currency ?? "AED";
  const journal: JournalLineData[] = journalLines.map((j) => ({
    accountName: j.account_name,
    accountId: j.account_id,
    debit: Number(j.debit),
    credit: Number(j.credit),
  }));

  return (
    <div>
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <Link href="/bills" className="mb-2 inline-flex items-center gap-1 text-xs text-gray-400 hover:text-brand-600">
          <ChevronLeft size={12} /> All Bills
        </Link>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-ink-800">{bill.bill_number}</h1>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[bill.status] ?? "bg-gray-100 text-gray-500"}`}>
              {STATUS_LABELS[bill.status] ?? bill.status}
            </span>
          </div>
          <Link href={`/bills/${bill.id}/edit`} className="btn-secondary">
            <Pencil size={14} /> Edit
          </Link>
        </div>
        <p className="mt-0.5 text-sm text-gray-500">
          {formatDate(bill.bill_date)} {vendor && <>&middot; {vendor.display_name}</>}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <div className="card space-y-5 p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Bill Amount</p>
                <p className="mt-1 text-2xl font-semibold text-red-600">{formatCurrency(Number(bill.total), currency)}</p>
                <p className="mt-0.5 text-xs text-gray-500">Balance Due: {formatCurrency(Number(bill.balance_due), currency)}</p>
              </div>
              <div className="text-right">
                {vendor && (
                  <Link href={`/vendors/${vendor.id}`} className="text-sm font-medium text-brand-600 hover:underline">
                    {vendor.display_name}
                  </Link>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 border-t border-gray-100 pt-4 sm:grid-cols-4">
              <Field label="Order Number" value={bill.order_number} />
              <Field label="Permit#" value={bill.permit_number} />
              <Field label="Due Date" value={bill.due_date ? formatDate(bill.due_date) : null} />
              <Field label="Payment Terms" value={PAYMENT_TERM_LABELS[bill.payment_terms] ?? bill.payment_terms} />
              <Field label="Subject" value={bill.subject} />
              <Field label="Accounts Payable" value={apAccount?.name ?? "Default"} />
            </div>

            <div className="border-t border-gray-100 pt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Item Table</p>
              <div className="overflow-x-auto rounded-md border border-gray-100">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-3 py-2">Item Details</th>
                      <th className="px-3 py-2">Account</th>
                      <th className="px-3 py-2 text-right">Qty</th>
                      <th className="px-3 py-2 text-right">Rate</th>
                      <th className="px-3 py-2">Tax</th>
                      <th className="px-3 py-2">Customer</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {lines.map((l) => (
                      <tr key={l.id}>
                        <td className="px-3 py-2 text-ink-700">{l.description}</td>
                        <td className="px-3 py-2">
                          {l.account_id ? (
                            <Link href={`/chart-of-accounts/${l.account_id}`} className="text-brand-600 hover:underline">
                              {l.account_name}
                            </Link>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td className="px-3 py-2 text-right text-ink-700">{Number(l.quantity)}</td>
                        <td className="px-3 py-2 text-right text-ink-700">{formatCurrency(Number(l.rate), currency)}</td>
                        <td className="px-3 py-2 text-ink-700">{l.tax_name ? `${l.tax_name} (${Number(l.tax_rate)}%)` : "-"}</td>
                        <td className="px-3 py-2">
                          {l.customer_id ? (
                            <Link href={`/customers/${l.customer_id}`} className="text-brand-600 hover:underline">
                              {l.customer_name}
                            </Link>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td className="px-3 py-2 text-right text-ink-800">{formatCurrency(Number(l.amount), currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex justify-end">
                <div className="w-64 space-y-1.5 text-sm">
                  <div className="flex items-center justify-between text-ink-700">
                    <span>Sub Total</span>
                    <span>{formatCurrency(Number(bill.subtotal), currency)}</span>
                  </div>
                  <div className="flex items-center justify-between text-ink-700">
                    <span>Tax</span>
                    <span>{formatCurrency(Number(bill.tax_total), currency)}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-gray-100 pt-1.5 font-semibold text-ink-800">
                    <span>Total</span>
                    <span>{formatCurrency(Number(bill.total), currency)}</span>
                  </div>
                </div>
              </div>
            </div>

            {bill.notes && (
              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Notes</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-gray-600">{bill.notes}</p>
              </div>
            )}
          </div>

          <JournalPanel title={`Bill - ${bill.bill_number}`} lines={journal} currency={currency} defaultOpen />

          <div className="card space-y-2 p-5">
            <h2 className="text-sm font-semibold text-ink-800">Payments Made</h2>
            {payments.length === 0 ? (
              <p className="text-sm text-gray-400">No payments have been recorded against this bill yet.</p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="border-y border-gray-100 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Payment #</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td className="px-3 py-2 text-ink-700">{formatDate(p.payment_date)}</td>
                      <td className="px-3 py-2">
                        <Link href={`/payments-made/${p.id}`} className="text-brand-600 hover:underline">
                          {p.payment_number}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-right text-ink-800">{formatCurrency(Number(p.amount), currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="card space-y-2 p-5">
            <h2 className="text-sm font-semibold text-ink-800">Attachments</h2>
            <AttachmentsField entityType="bills" entityId={bill.id} label="" />
          </div>
        </div>
      </div>
    </div>
  );
}
