import { NextRequest, NextResponse } from "next/server";
import { pool, queryOne } from "@/lib/db";
import { getApiOrgContext, unauthorized } from "@/lib/api-context";
import { syncOpeningBalanceJournal } from "@/lib/auto-journal";
import { accountCategory } from "@/lib/accounts";

interface AccountLineInput {
  account_id?: unknown;
  debit?: unknown;
  credit?: unknown;
}

function num(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
}

// PATCH /api/settings/opening-balances — saves the Migration Date plus every directly-
// entered Asset/Liability/Equity account row (never Accounts Receivable/Accounts Payable,
// which come from customers.opening_balance/vendors.opening_balance instead — see
// syncOpeningBalanceJournal's docstring), then rebuilds the single consolidated journal.
export async function PATCH(req: NextRequest) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  if (ctx.role !== "owner" && ctx.role !== "admin") {
    return NextResponse.json({ error: "Only owners and admins can update opening balances." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));

  const migrationDate = typeof body.migration_date === "string" ? body.migration_date.trim() : "";
  if (!migrationDate) {
    return NextResponse.json({ error: "Migration Date is required." }, { status: 400 });
  }

  const rawAccounts: AccountLineInput[] = Array.isArray(body.accounts) ? body.accounts : [];

  // Every submitted account has to actually belong to this org, be active, and be a real
  // Asset/Liability/Equity account (not Accounts Receivable/Accounts Payable, and not an
  // Income/Expense account — Opening Balances only covers Balance Sheet accounts, same as
  // real Zoho Books) — re-checked here, not just trusted from the client, the same ownership-
  // check shape used elsewhere in this app for a client-supplied account id.
  const accountRows = await pool.query<{ id: string; type: string }>(
    `SELECT id, type FROM accounts WHERE organization_id = $1 AND is_active = true`,
    [ctx.orgId]
  );
  const validAccounts = new Map(accountRows.rows.map((a) => [a.id, a.type]));

  const lines: { accountId: string; debit: number; credit: number }[] = [];
  for (const raw of rawAccounts) {
    const accountId = typeof raw.account_id === "string" ? raw.account_id : "";
    const type = validAccounts.get(accountId);
    if (!type) continue; // not a real, active, org-owned account — silently skip rather than 400
    if (type === "accounts_receivable" || type === "accounts_payable") continue;
    const category = accountCategory(type);
    if (category !== "asset" && category !== "liability" && category !== "equity") continue;

    const debit = num(raw.debit);
    const credit = num(raw.credit);
    if (debit > 0 && credit > 0) {
      return NextResponse.json(
        { error: "An account can't have both a debit and a credit on the same opening balance line." },
        { status: 400 }
      );
    }
    if (debit === 0 && credit === 0) continue;
    lines.push({ accountId, debit, credit });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`UPDATE organizations SET opening_balance_migration_date = $1 WHERE id = $2`, [
      migrationDate,
      ctx.orgId,
    ]);
    await client.query(`DELETE FROM account_opening_balances WHERE organization_id = $1`, [ctx.orgId]);
    for (const line of lines) {
      await client.query(
        `INSERT INTO account_opening_balances (organization_id, account_id, debit, credit) VALUES ($1, $2, $3, $4)`,
        [ctx.orgId, line.accountId, line.debit, line.credit]
      );
    }
    await syncOpeningBalanceJournal(client, ctx.orgId);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    return NextResponse.json({ error: "Could not save opening balances." }, { status: 500 });
  } finally {
    client.release();
  }

  return NextResponse.json({ ok: true });
}

// DELETE /api/settings/opening-balances — clears the Migration Date and every directly-
// entered account row, which removes the consolidated journal too (syncOpeningBalanceJournal
// posts nothing once there's no Migration Date). Deliberately does NOT touch
// customers.opening_balance/vendors.opening_balance themselves — those are separate fields
// owned by the Customer/Vendor forms, not by this settings page; clearing this page's own
// configuration doesn't erase what a customer/vendor record independently captures.
export async function DELETE() {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  if (ctx.role !== "owner" && ctx.role !== "admin") {
    return NextResponse.json({ error: "Only owners and admins can delete opening balances." }, { status: 403 });
  }

  const org = await queryOne<{ opening_balance_migration_date: string | null }>(
    `SELECT opening_balance_migration_date FROM organizations WHERE id = $1`,
    [ctx.orgId]
  );
  if (!org?.opening_balance_migration_date) {
    return NextResponse.json({ error: "There are no opening balances to delete." }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`UPDATE organizations SET opening_balance_migration_date = NULL WHERE id = $1`, [ctx.orgId]);
    await client.query(`DELETE FROM account_opening_balances WHERE organization_id = $1`, [ctx.orgId]);
    await syncOpeningBalanceJournal(client, ctx.orgId);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    return NextResponse.json({ error: "Could not delete opening balances." }, { status: 500 });
  } finally {
    client.release();
  }

  return NextResponse.json({ ok: true });
}
