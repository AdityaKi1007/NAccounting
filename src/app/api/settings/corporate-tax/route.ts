import { NextRequest, NextResponse } from "next/server";
import { pool, queryOne } from "@/lib/db";
import { getApiOrgContext, unauthorized } from "@/lib/api-context";
import { canManageOrgSettings } from "@/lib/module-access";

const CORPORATE_TAX_COLUMNS = `id, corporate_tax_registration_number, corporate_tax_rate, corporate_tax_first_return_from,
  corporate_tax_liability_account_id, corporate_tax_liability_offset_account_id,
  corporate_tax_add_back_expense_account_id, corporate_tax_income_deducted_account_id,
  corporate_tax_entertainment_expenditure_account_id, corporate_tax_net_interest_expenditure_account_id`;

const ACCOUNT_FIELDS = [
  "corporate_tax_liability_account_id",
  "corporate_tax_liability_offset_account_id",
  "corporate_tax_add_back_expense_account_id",
  "corporate_tax_income_deducted_account_id",
  "corporate_tax_entertainment_expenditure_account_id",
  "corporate_tax_net_interest_expenditure_account_id",
] as const;

export async function GET() {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();

  const org = await queryOne(`SELECT ${CORPORATE_TAX_COLUMNS} FROM organizations WHERE id = $1`, [ctx.orgId]);
  return NextResponse.json({ organization: org });
}

function nullableStr(v: unknown) {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
}

export async function PATCH(req: NextRequest) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  if (!canManageOrgSettings(ctx)) {
    return NextResponse.json({ error: "Only owners and admins can update corporate tax settings." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));

  const trn = nullableStr(body.corporate_tax_registration_number);
  if (!trn) return NextResponse.json({ error: "Tax Registration Number is required." }, { status: 400 });

  const firstReturnFrom = nullableStr(body.corporate_tax_first_return_from);
  if (!firstReturnFrom) {
    return NextResponse.json({ error: "Generate First Corporate Tax Return From is required." }, { status: 400 });
  }

  const rateRaw = Number(body.corporate_tax_rate);
  const rate = Number.isFinite(rateRaw) ? rateRaw : 9;

  // Every submitted account id has to actually belong to this org — these are real FK
  // columns (see the 2026-09-10 migration), but the FK alone doesn't stop a client from
  // passing another organization's account id, only a nonexistent one. Same ownership-check
  // shape used elsewhere for a single account reference (e.g. receipts-api.ts's bank account
  // check). The two required fields 404 if missing/foreign; the four optional ones are simply
  // cleared (null) if omitted or foreign, rather than erroring, since they're allowed to be
  // unset.
  const accountValues: Record<(typeof ACCOUNT_FIELDS)[number], string | null> = {
    corporate_tax_liability_account_id: null,
    corporate_tax_liability_offset_account_id: null,
    corporate_tax_add_back_expense_account_id: null,
    corporate_tax_income_deducted_account_id: null,
    corporate_tax_entertainment_expenditure_account_id: null,
    corporate_tax_net_interest_expenditure_account_id: null,
  };
  for (const field of ACCOUNT_FIELDS) {
    const raw = body[field];
    if (typeof raw !== "string" || !raw) continue;
    const account = await queryOne<{ id: string }>(`SELECT id FROM accounts WHERE id = $1 AND organization_id = $2`, [
      raw,
      ctx.orgId,
    ]);
    if (account) accountValues[field] = account.id;
  }

  if (!accountValues.corporate_tax_liability_account_id) {
    return NextResponse.json({ error: "Corporate Tax Liability Account is required." }, { status: 400 });
  }
  if (!accountValues.corporate_tax_liability_offset_account_id) {
    return NextResponse.json({ error: "Corporate Tax Liability Offset Account is required." }, { status: 400 });
  }

  const values = {
    corporate_tax_registration_number: trn,
    corporate_tax_rate: rate,
    corporate_tax_first_return_from: firstReturnFrom,
    ...accountValues,
  };

  const keys = Object.keys(values) as (keyof typeof values)[];
  const setClauses = keys.map((k, i) => `${k} = $${i + 2}`).join(", ");
  const org = await pool.query(
    `UPDATE organizations SET ${setClauses} WHERE id = $1 RETURNING ${CORPORATE_TAX_COLUMNS}`,
    [ctx.orgId, ...keys.map((k) => values[k])]
  );

  return NextResponse.json({ organization: org.rows[0] });
}
