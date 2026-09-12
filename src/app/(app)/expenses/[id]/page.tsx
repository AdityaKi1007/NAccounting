import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Pencil } from "lucide-react";
import { requireActiveContext } from "@/lib/session";
import { requireModuleAccess } from "@/lib/module-access";
import { query, queryOne } from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/format";
import { getEntity } from "@/lib/entities";
import AttachmentsField from "@/components/attachments/AttachmentsField";
import JournalPanel, { type JournalLineData } from "@/components/accounting/JournalPanel";

interface ExpenseRow {
  id: string;
  expense_date: string;
  account_id: string | null;
  paid_through_account_id: string | null;
  vendor_id: string | null;
  amount: string;
  tax_amount: string;
  tax_treatment: string;
  place_of_supply: string | null;
  reverse_charge: boolean;
  tax_rate_id: string | null;
  reference_number: string | null;
  notes: string | null;
  customer_id: string | null;
  created_at: string;
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-0.5 text-sm text-ink-700">{value || "-"}</p>
    </div>
  );
}

/** Read-only detail view at /expenses/[id] — see entities.ts's own comment on the expenses
 * entity for why this exists instead of going straight to the edit form (same pattern as
 * Vendors/Customers/Chart of Accounts). Journal panel + the account tag's link to
 * /chart-of-accounts/[id] is what "manage journal entries" / "navigate to detail page with
 * journal details" from the request refers to — see JournalPanel.tsx's accountId prop and
 * chart-of-accounts/[id]/page.tsx, which already lists every journal line and expense posted
 * to that account. */
export default async function ExpenseDetailPage({ params }: { params: { id: string } }) {
  const ctx = await requireActiveContext();
  await requireModuleAccess(ctx, "expenses", "view");

  const expense = await queryOne<ExpenseRow>(
    `SELECT id, expense_date, account_id, paid_through_account_id, vendor_id, amount, tax_amount,
            tax_treatment, place_of_supply, reverse_charge, tax_rate_id, reference_number, notes,
            customer_id, created_at
     FROM expenses WHERE id = $1 AND organization_id = $2`,
    [params.id, ctx.orgId]
  );
  if (!expense) notFound();

  const [account, bank, vendor, customer, taxRate, org, journalLines] = await Promise.all([
    expense.account_id
      ? queryOne<{ id: string; name: string }>(`SELECT id, name FROM accounts WHERE id = $1 AND organization_id = $2`, [
          expense.account_id,
          ctx.orgId,
        ])
      : Promise.resolve(null),
    expense.paid_through_account_id
      ? queryOne<{ account_name: string }>(`SELECT account_name FROM bank_accounts WHERE id = $1 AND organization_id = $2`, [
          expense.paid_through_account_id,
          ctx.orgId,
        ])
      : Promise.resolve(null),
    expense.vendor_id
      ? queryOne<{ id: string; display_name: string }>(`SELECT id, display_name FROM vendors WHERE id = $1 AND organization_id = $2`, [
          expense.vendor_id,
          ctx.orgId,
        ])
      : Promise.resolve(null),
    expense.customer_id
      ? queryOne<{ id: string; display_name: string }>(`SELECT id, display_name FROM customers WHERE id = $1 AND organization_id = $2`, [
          expense.customer_id,
          ctx.orgId,
        ])
      : Promise.resolve(null),
    expense.tax_rate_id
      ? queryOne<{ name: string; rate: string }>(`SELECT name, rate FROM tax_rates WHERE id = $1 AND organization_id = $2`, [
          expense.tax_rate_id,
          ctx.orgId,
        ])
      : Promise.resolve(null),
    queryOne<{ currency: string }>(`SELECT currency FROM organizations WHERE id = $1`, [ctx.orgId]),
    query<{ account_id: string; account_name: string; debit: string; credit: string }>(
      `SELECT a.id AS account_id, a.name AS account_name, jl.debit, jl.credit
       FROM journal_lines jl
       JOIN manual_journals mj ON mj.id = jl.journal_id
       JOIN accounts a ON a.id = jl.account_id
       WHERE mj.expense_id = $1
       ORDER BY jl.id ASC`,
      [expense.id]
    ),
  ]);

  const entity = getEntity("expenses");
  const taxTreatmentLabel =
    entity?.fields.find((f) => f.name === "tax_treatment")?.options?.find((o) => o.value === expense.tax_treatment)?.label ??
    expense.tax_treatment;
  const currency = org?.currency ?? "AED";
  const total = Number(expense.amount) + Number(expense.tax_amount);

  const journal: JournalLineData[] = journalLines.map((j) => ({
    accountName: j.account_name,
    accountId: j.account_id,
    debit: Number(j.debit),
    credit: Number(j.credit),
  }));

  return (
    <div>
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <Link href="/expenses" className="mb-2 inline-flex items-center gap-1 text-xs text-gray-400 hover:text-brand-600">
          <ChevronLeft size={12} /> Expenses
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-ink-800">{account?.name ?? "Expense"}</h1>
            <p className="mt-0.5 text-sm text-gray-500">
              {formatDate(expense.expense_date)} {vendor && <>&middot; {vendor.display_name}</>}
            </p>
          </div>
          <Link href={`/expenses/${expense.id}/edit`} className="btn-secondary">
            <Pencil size={14} /> Edit
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <JournalPanel title={account?.name ?? "Expense"} lines={journal} currency={currency} defaultOpen />

          <div className="card space-y-5 p-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Expense Amount</p>
              <p className="mt-1 text-2xl font-semibold text-red-600">
                {formatCurrency(total, currency)} <span className="text-sm font-normal text-gray-500">on {formatDate(expense.expense_date)}</span>
              </p>
              {!expense.customer_id && <p className="mt-1 text-xs font-medium uppercase tracking-wide text-gray-400">Non-billable</p>}
            </div>

            {account && (
              <span className="inline-block rounded bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                <Link href={`/chart-of-accounts/${account.id}`} className="hover:underline">
                  {account.name}
                </Link>
              </span>
            )}

            <div className="grid grid-cols-2 gap-4">
              <Field label="Paid Through" value={bank?.account_name} />
              <Field
                label="Paid To"
                value={vendor ? <Link href={`/vendors/${vendor.id}`} className="text-brand-600 hover:underline">{vendor.display_name}</Link> : null}
              />
              <Field label="Tax Treatment" value={taxTreatmentLabel} />
              <Field label="Place of Supply" value={expense.place_of_supply} />
              <Field label="Tax" value={taxRate ? `${taxRate.name} (${Number(taxRate.rate)}%)` : "-"} />
              <Field label="Reverse Charge (DRC)" value={expense.reverse_charge ? "Yes" : "No"} />
              <Field label="Reference #" value={expense.reference_number} />
              <Field
                label="Customer"
                value={customer ? <Link href={`/customers/${customer.id}`} className="text-brand-600 hover:underline">{customer.display_name}</Link> : null}
              />
            </div>

            {expense.notes && (
              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Notes</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-gray-600">{expense.notes}</p>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="card space-y-2 p-5">
            <h2 className="text-sm font-semibold text-ink-800">Receipts</h2>
            <AttachmentsField entityType="expenses" entityId={expense.id} label="" />
          </div>
        </div>
      </div>
    </div>
  );
}
