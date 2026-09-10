import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, FileText, Pencil } from "lucide-react";
import { requireActiveContext } from "@/lib/session";
import { query, queryOne } from "@/lib/db";
import { getEntity } from "@/lib/entities";
import { accountCategory, closingBalance } from "@/lib/accounts";
import { formatCurrency, formatDate, titleCase } from "@/lib/format";

interface AccountRow {
  id: string;
  name: string;
  code: string | null;
  type: string;
  description: string | null;
  is_active: boolean;
}

interface Txn {
  id: string;
  date: string;
  source: "Journal" | "Expense";
  reference: string | null;
  description: string | null;
  debit: number;
  credit: number;
}

export default async function AccountDetailPage({ params }: { params: { id: string } }) {
  const ctx = await requireActiveContext();

  const account = await queryOne<AccountRow>(
    `SELECT id, name, code, type, description, is_active FROM accounts WHERE id = $1 AND organization_id = $2`,
    [params.id, ctx.orgId]
  );
  if (!account) notFound();

  const entity = getEntity("chart-of-accounts");
  const typeLabel = entity?.fields.find((f) => f.name === "type")?.options?.find((o) => o.value === account.type)?.label
    ?? titleCase(account.type);

  const org = await queryOne<{ currency: string }>(`SELECT currency FROM organizations WHERE id = $1`, [ctx.orgId]);
  const currency = org?.currency ?? "AED";

  // Only manual journal lines and expenses reference accounts.id directly in this build —
  // invoices/bills post to their own tables, not a shared ledger — so those are the two
  // honest sources for "transactions on this account" rather than a fabricated feed.
  const [journalRows, expenseRows] = await Promise.all([
    query<{ id: string; date: string; journal_number: string; reference_number: string | null; description: string | null; debit: string; credit: string }>(
      `SELECT jl.id, mj.journal_date AS date, mj.journal_number, mj.reference_number,
              COALESCE(jl.description, mj.notes) AS description, jl.debit, jl.credit
       FROM journal_lines jl
       JOIN manual_journals mj ON mj.id = jl.journal_id
       WHERE jl.account_id = $1 AND mj.organization_id = $2
       ORDER BY mj.journal_date DESC, mj.created_at DESC`,
      [params.id, ctx.orgId]
    ),
    query<{ id: string; date: string; reference_number: string | null; description: string | null; amount: string }>(
      `SELECT id, expense_date AS date, reference_number, notes AS description, amount
       FROM expenses
       WHERE account_id = $1 AND organization_id = $2
       ORDER BY expense_date DESC, created_at DESC`,
      [params.id, ctx.orgId]
    ),
  ]);

  const transactions: Txn[] = [
    ...journalRows.map((r) => ({
      id: r.id,
      date: r.date,
      source: "Journal" as const,
      reference: r.journal_number || r.reference_number,
      description: r.description,
      debit: Number(r.debit),
      credit: Number(r.credit),
    })),
    ...expenseRows.map((r) => ({
      id: r.id,
      date: r.date,
      source: "Expense" as const,
      reference: r.reference_number,
      description: r.description,
      debit: Number(r.amount),
      credit: 0,
    })),
  ].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const totalDebit = transactions.reduce((sum, t) => sum + t.debit, 0);
  const totalCredit = transactions.reduce((sum, t) => sum + t.credit, 0);
  const balance = closingBalance(totalDebit, totalCredit);
  const category = accountCategory(account.type);

  return (
    <div>
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <Link
          href="/chart-of-accounts"
          className="mb-2 inline-flex items-center gap-1 text-xs text-gray-400 hover:text-brand-600"
        >
          <ChevronLeft size={12} /> Chart of Accounts
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{typeLabel}</p>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold text-ink-800">{account.name}</h1>
              {!account.is_active && (
                <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">Inactive</span>
              )}
            </div>
          </div>
          <Link href={`/chart-of-accounts/${account.id}/edit`} className="btn-secondary">
            <Pencil size={14} /> Edit
          </Link>
        </div>
      </div>

      <div className="p-6">
        <div className="card mb-6 space-y-2 p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Closing Balance</p>
          <p className="text-2xl font-semibold text-brand-600">
            {formatCurrency(balance.amount, currency)}{" "}
            <span className="text-base font-medium text-gray-400">({balance.side === "debit" ? "Dr" : "Cr"})</span>
          </p>
          {account.description && (
            <p className="pt-2 text-sm text-gray-600">
              <span className="font-medium text-ink-700">Description: </span>
              {account.description}
            </p>
          )}
          <p className="pt-1 text-xs text-gray-400">
            Code {account.code || "-"} &middot; {category === "asset" || category === "expense" ? "Debit" : "Credit"}-normal
            account
          </p>
        </div>

        <div className="card">
          {transactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <FileText size={32} className="text-gray-300" />
              <p className="text-sm text-gray-500">There are no transactions available</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-2.5">Date</th>
                    <th className="px-4 py-2.5">Type</th>
                    <th className="px-4 py-2.5">Reference</th>
                    <th className="px-4 py-2.5">Description</th>
                    <th className="px-4 py-2.5 text-right">Debit</th>
                    <th className="px-4 py-2.5 text-right">Credit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {transactions.map((t) => (
                    <tr key={`${t.source}-${t.id}`}>
                      <td className="px-4 py-2.5 text-ink-700">{formatDate(t.date)}</td>
                      <td className="px-4 py-2.5 text-ink-700">{t.source}</td>
                      <td className="px-4 py-2.5 text-ink-700">{t.reference || "-"}</td>
                      <td className="px-4 py-2.5 text-ink-700">{t.description || "-"}</td>
                      <td className="px-4 py-2.5 text-right text-ink-800">{t.debit ? formatCurrency(t.debit, currency) : "-"}</td>
                      <td className="px-4 py-2.5 text-right text-ink-800">{t.credit ? formatCurrency(t.credit, currency) : "-"}</td>
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
}
