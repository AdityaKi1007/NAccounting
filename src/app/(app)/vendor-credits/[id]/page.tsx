import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Pencil } from "lucide-react";
import { requireActiveContext } from "@/lib/session";
import { requireModuleAccess } from "@/lib/module-access";
import { query, queryOne } from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/format";
import AttachmentsField from "@/components/attachments/AttachmentsField";
import JournalPanel, { type JournalLineData } from "@/components/accounting/JournalPanel";

interface CreditRow {
  id: string;
  credit_note_number: string;
  vendor_id: string | null;
  credit_date: string;
  order_number: string | null;
  subject: string | null;
  accounts_payable_account_id: string | null;
  discount_percent: string;
  status: string;
  subtotal: string;
  tax_total: string;
  total: string;
  reason: string | null;
}

interface LineRow {
  id: string;
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

const STATUS_STYLES: Record<string, string> = {
  open: "bg-blue-100 text-blue-700",
  closed: "bg-gray-100 text-gray-500",
};

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-0.5 text-sm text-ink-700">{value || "-"}</p>
    </div>
  );
}

/** Read-only detail view at /vendor-credits/[id] — reached by clicking the Vendor Credit #
 * from the list, or right after Save (see VendorCreditForm.tsx). Same account-link pattern
 * as the Bill/Expense detail views. */
export default async function VendorCreditDetailPage({ params }: { params: { id: string } }) {
  const ctx = await requireActiveContext();
  await requireModuleAccess(ctx, "vendor-credits", "view");

  const credit = await queryOne<CreditRow>(
    `SELECT id, credit_note_number, vendor_id, credit_date, order_number, subject,
            accounts_payable_account_id, discount_percent, status, subtotal, tax_total, total, reason
     FROM vendor_credits WHERE id = $1 AND organization_id = $2`,
    [params.id, ctx.orgId]
  );
  if (!credit) notFound();

  const [vendor, apAccount, org, lines, journalLines] = await Promise.all([
    credit.vendor_id
      ? queryOne<{ id: string; display_name: string }>(`SELECT id, display_name FROM vendors WHERE id = $1 AND organization_id = $2`, [
          credit.vendor_id,
          ctx.orgId,
        ])
      : Promise.resolve(null),
    credit.accounts_payable_account_id
      ? queryOne<{ name: string }>(`SELECT name FROM accounts WHERE id = $1 AND organization_id = $2`, [
          credit.accounts_payable_account_id,
          ctx.orgId,
        ])
      : Promise.resolve(null),
    queryOne<{ currency: string }>(`SELECT currency FROM organizations WHERE id = $1`, [ctx.orgId]),
    query<LineRow>(
      `SELECT vci.id, vci.description, vci.quantity, vci.rate, vci.amount,
              vci.account_id, a.name AS account_name,
              vci.tax_rate_id, tr.name AS tax_name, tr.rate AS tax_rate,
              vci.customer_id, c.display_name AS customer_name
       FROM vendor_credit_items vci
       LEFT JOIN accounts a ON a.id = vci.account_id
       LEFT JOIN tax_rates tr ON tr.id = vci.tax_rate_id
       LEFT JOIN customers c ON c.id = vci.customer_id
       WHERE vci.vendor_credit_id = $1
       ORDER BY vci.id ASC`,
      [credit.id]
    ),
    query<{ account_id: string; account_name: string; debit: string; credit: string }>(
      `SELECT a.id AS account_id, a.name AS account_name, jl.debit, jl.credit
       FROM journal_lines jl
       JOIN manual_journals mj ON mj.id = jl.journal_id
       JOIN accounts a ON a.id = jl.account_id
       WHERE mj.vendor_credit_id = $1
       ORDER BY jl.id ASC`,
      [credit.id]
    ),
  ]);

  const currency = org?.currency ?? "AED";
  const discountAmount = Math.round(((Number(credit.subtotal) * Number(credit.discount_percent)) / 100) * 100) / 100;
  const journal: JournalLineData[] = journalLines.map((j) => ({
    accountName: j.account_name,
    accountId: j.account_id,
    debit: Number(j.debit),
    credit: Number(j.credit),
  }));

  return (
    <div>
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <Link href="/vendor-credits" className="mb-2 inline-flex items-center gap-1 text-xs text-gray-400 hover:text-brand-600">
          <ChevronLeft size={12} /> All Vendor Credits
        </Link>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-ink-800">{credit.credit_note_number}</h1>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[credit.status] ?? "bg-gray-100 text-gray-500"}`}>
              {credit.status === "open" ? "Open" : "Closed"}
            </span>
          </div>
          <Link href={`/vendor-credits/${credit.id}/edit`} className="btn-secondary">
            <Pencil size={14} /> Edit
          </Link>
        </div>
        <p className="mt-0.5 text-sm text-gray-500">
          {formatDate(credit.credit_date)} {vendor && <>&middot; {vendor.display_name}</>}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <div className="card space-y-5 p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Credit Amount</p>
                <p className="mt-1 text-2xl font-semibold text-emerald-600">{formatCurrency(Number(credit.total), currency)}</p>
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
              <Field label="Order Number" value={credit.order_number} />
              <Field label="Subject" value={credit.subject} />
              <Field label="Accounts Payable" value={apAccount?.name ?? "Default"} />
              <Field label="Reason" value={credit.reason} />
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
                    <span>{formatCurrency(Number(credit.subtotal), currency)}</span>
                  </div>
                  <div className="flex items-center justify-between text-ink-700">
                    <span>Discount ({Number(credit.discount_percent)}%)</span>
                    <span>-{formatCurrency(discountAmount, currency)}</span>
                  </div>
                  {Number(credit.tax_total) > 0 && (
                    <div className="flex items-center justify-between text-ink-700">
                      <span>Tax</span>
                      <span>{formatCurrency(Number(credit.tax_total), currency)}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between border-t border-gray-100 pt-1.5 font-semibold text-ink-800">
                    <span>Total</span>
                    <span>{formatCurrency(Number(credit.total), currency)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <JournalPanel title={`Vendor Credit - ${credit.credit_note_number}`} lines={journal} currency={currency} defaultOpen />
        </div>

        <div className="space-y-6">
          <div className="card space-y-2 p-5">
            <h2 className="text-sm font-semibold text-ink-800">Attachments</h2>
            <AttachmentsField entityType="vendor-credits" entityId={credit.id} label="" />
          </div>
        </div>
      </div>
    </div>
  );
}
