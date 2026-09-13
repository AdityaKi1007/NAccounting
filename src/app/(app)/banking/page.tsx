import { listRows } from "@/lib/crud";
import { requireActiveContext } from "@/lib/session";
import { requireModuleAccess } from "@/lib/module-access";
import { query } from "@/lib/db";
import { closingBalance } from "@/lib/accounts";
import BankingClient, { type BankRow, type BookBalance } from "@/components/banking/BankingClient";

interface BankAccountRow extends BankRow {
  gl_account_id: string | null;
}

export default async function BankingPage() {
  const ctx = await requireActiveContext();
  await requireModuleAccess(ctx, "banking", "view");
  const rows = (await listRows("bank-accounts", ctx.orgId)) as BankAccountRow[];

  // "Amount in Books" (see BankingClient) is each bank account's real GL ledger balance, not
  // the static opening_balance column the old card view used to show — same two sources
  // (journal_lines + expenses) the Chart of Accounts detail page itself uses, so the number
  // here always matches what that account's own ledger page shows. This is a real, intentional
  // behavior change: the figure now reflects actual receipts/payments/expenses posted against
  // the account, not just whatever was typed into "Opening Balance" when the account was
  // created (that field was never posted to the GL — see the Banking/GL-relation addendum).
  const glAccountIds = Array.from(new Set(rows.map((r) => r.gl_account_id).filter((id): id is string => Boolean(id))));

  const bookBalances: Record<string, BookBalance> = {};
  if (glAccountIds.length > 0) {
    const [journalSums, expenseSums] = await Promise.all([
      query<{ account_id: string; debit: string | null; credit: string | null }>(
        `SELECT jl.account_id, SUM(jl.debit) AS debit, SUM(jl.credit) AS credit
         FROM journal_lines jl
         JOIN manual_journals mj ON mj.id = jl.journal_id
         WHERE mj.organization_id = $1 AND jl.account_id = ANY($2::uuid[])
         GROUP BY jl.account_id`,
        [ctx.orgId, glAccountIds]
      ),
      query<{ account_id: string; amount: string | null }>(
        `SELECT account_id, SUM(amount) AS amount
         FROM expenses
         WHERE organization_id = $1 AND account_id = ANY($2::uuid[])
         GROUP BY account_id`,
        [ctx.orgId, glAccountIds]
      ),
    ]);
    const totals = new Map<string, { debit: number; credit: number }>();
    for (const id of glAccountIds) totals.set(id, { debit: 0, credit: 0 });
    for (const r of journalSums) {
      const t = totals.get(r.account_id)!;
      t.debit += Number(r.debit ?? 0);
      t.credit += Number(r.credit ?? 0);
    }
    for (const r of expenseSums) {
      const t = totals.get(r.account_id)!;
      t.debit += Number(r.amount ?? 0);
    }
    for (const row of rows) {
      if (!row.gl_account_id) continue;
      const t = totals.get(row.gl_account_id);
      if (!t) continue;
      const balance = closingBalance(t.debit, t.credit);
      bookBalances[row.id] = { amount: balance.amount, side: balance.side };
    }
  }

  // Options for the Add/Edit modal's "Link to Chart of Accounts" select — every active COA
  // entry, not just bank/cash-typed ones, since a real org's chart doesn't always categorize
  // things the way this app's own defaults do (exactly what let the user's own
  // "Emirates NBD - Current" get created as a plain Asset-type entry by hand).
  const glAccountOptions = await query<{ id: string; name: string; type: string }>(
    `SELECT id, name, type FROM accounts WHERE organization_id = $1 AND is_active ORDER BY name ASC`,
    [ctx.orgId]
  );

  return <BankingClient rows={rows} bookBalances={bookBalances} glAccountOptions={glAccountOptions} />;
}
