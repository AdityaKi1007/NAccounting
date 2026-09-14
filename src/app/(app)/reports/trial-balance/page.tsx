import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireActiveContext } from "@/lib/session";
import { requireModuleAccess } from "@/lib/module-access";
import { query } from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/format";
import { defaultAsOfDate } from "@/lib/report-dates";
import { processDueJournalReversals } from "@/lib/journal-reversals";
import { processDueRevenueRecognition } from "@/lib/auto-journal";
import ReportAsOfBar from "@/components/reports/ReportAsOfBar";

interface AccountLine {
  id: string;
  name: string;
  debit: string;
  credit: string;
}

// Every account with any published activity through the as-of date, each shown on whichever
// side (Debit or Credit) its net balance actually falls on — never both, matching the classic
// Trial Balance format. The two column totals must match; a mismatch would mean a bug in the
// underlying journal-posting logic (every auto-journal always balances by construction), so
// this doubles as a live sanity check on the GL itself.
export default async function TrialBalancePage({ searchParams }: { searchParams: { asOf?: string } }) {
  const ctx = await requireActiveContext();
  await requireModuleAccess(ctx, "reports", "view");
  await processDueJournalReversals(ctx.orgId);
  await processDueRevenueRecognition(ctx.orgId);
  const asOf = searchParams.asOf || defaultAsOfDate();

  const lines = await query<AccountLine>(
    `SELECT a.id, a.name, COALESCE(SUM(jl.debit), 0) AS debit, COALESCE(SUM(jl.credit), 0) AS credit
     FROM journal_lines jl
     JOIN manual_journals mj ON mj.id = jl.journal_id
     JOIN accounts a ON a.id = jl.account_id
     WHERE mj.organization_id = $1 AND a.organization_id = $1 AND mj.status = 'published' AND mj.journal_date <= $2
     GROUP BY a.id, a.name
     HAVING COALESCE(SUM(jl.debit), 0) != COALESCE(SUM(jl.credit), 0)
     ORDER BY a.name`,
    [ctx.orgId, asOf]
  );

  // A Trial Balance shows whichever side an account's net balance actually falls on — purely
  // by the sign of (debit - credit), with no reference to the account's own "normal" side.
  // (An earlier version of this page tried to classify by account type, e.g. "assets are
  // debit-normal", but that conflated two unrelated things: a credit-normal account like a
  // liability legitimately nets negative in debit-minus-credit terms, and the type-based
  // check incorrectly routed those into the Debit column instead of Credit, breaking the
  // Debit/Credit totals' agreement. Caught live: the two footer totals didn't match despite
  // every underlying journal entry being posted balanced.)
  const rows = lines.map((l) => {
    const net = Number(l.debit) - Number(l.credit);
    return { id: l.id, name: l.name, debitAmount: net > 0 ? net : 0, creditAmount: net < 0 ? -net : 0 };
  });

  const totalDebit = rows.reduce((sum, r) => sum + r.debitAmount, 0);
  const totalCredit = rows.reduce((sum, r) => sum + r.creditAmount, 0);

  return (
    <div>
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <Link href="/reports" className="mb-1 flex items-center gap-1 text-xs text-gray-400 hover:text-brand-600">
          <ChevronLeft size={12} /> All Reports
        </Link>
        <h1 className="text-lg font-semibold text-ink-800">Trial Balance</h1>
        <p className="mt-0.5 text-sm text-gray-500">As of {formatDate(asOf)}</p>
      </div>

      <ReportAsOfBar asOf={asOf} />

      <div className="p-6">
        <div className="card overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-5 py-2.5">Account Name</th>
                <th className="px-5 py-2.5 text-right">Debit</th>
                <th className="px-5 py-2.5 text-right">Credit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.length === 0 ? (
                <tr>
                  <td className="px-5 py-10 text-center text-gray-400" colSpan={3}>
                    No posted activity as of this date.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-5 py-2.5 text-ink-700">
                      <Link href={`/chart-of-accounts/${r.id}`} className="hover:underline">
                        {r.name}
                      </Link>
                    </td>
                    <td className="px-5 py-2.5 text-right text-ink-800">
                      {r.debitAmount > 0 ? formatCurrency(r.debitAmount) : ""}
                    </td>
                    <td className="px-5 py-2.5 text-right text-ink-800">
                      {r.creditAmount > 0 ? formatCurrency(r.creditAmount) : ""}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold text-ink-800">
                  <td className="px-5 py-2.5">Total</td>
                  <td className="px-5 py-2.5 text-right">{formatCurrency(totalDebit)}</td>
                  <td className="px-5 py-2.5 text-right">{formatCurrency(totalCredit)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {Math.abs(totalDebit - totalCredit) > 0.01 && (
          <p className="mt-3 text-xs text-amber-600">
            Note: Total Debit and Total Credit don&apos;t match by{" "}
            {formatCurrency(Math.abs(totalDebit - totalCredit))} — this shouldn&apos;t normally happen since every
            journal entry is posted balanced; see each document&apos;s Journal panel if this persists.
          </p>
        )}
      </div>
    </div>
  );
}
