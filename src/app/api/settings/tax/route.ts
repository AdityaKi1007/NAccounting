import { NextRequest, NextResponse } from "next/server";
import { pool, queryOne } from "@/lib/db";
import { getApiOrgContext, unauthorized } from "@/lib/api-context";
import { canManageOrgSettings } from "@/lib/module-access";

const TAX_COLUMNS = `id, tax_registration_number, tax_identification_number, international_trade_enabled,
  business_legal_name, business_trade_name, vat_registered_on, first_tax_return_from, tax_reporting_period`;

export async function GET() {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();

  const org = await queryOne(`SELECT ${TAX_COLUMNS} FROM organizations WHERE id = $1`, [ctx.orgId]);
  return NextResponse.json({ organization: org });
}

function nullableStr(v: unknown) {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
}
function nullableDate(v: unknown) {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
}

export async function PATCH(req: NextRequest) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  if (!canManageOrgSettings(ctx)) {
    return NextResponse.json({ error: "Only owners and admins can update tax settings." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const reportingPeriod = ["monthly", "quarterly", "annually"].includes(body.tax_reporting_period)
    ? body.tax_reporting_period
    : "monthly";

  const values = {
    tax_registration_number: nullableStr(body.tax_registration_number),
    tax_identification_number: nullableStr(body.tax_identification_number),
    international_trade_enabled: Boolean(body.international_trade_enabled),
    business_legal_name: nullableStr(body.business_legal_name),
    business_trade_name: nullableStr(body.business_trade_name),
    vat_registered_on: nullableDate(body.vat_registered_on),
    first_tax_return_from: nullableDate(body.first_tax_return_from),
    tax_reporting_period: reportingPeriod,
  };

  const keys = Object.keys(values) as (keyof typeof values)[];
  const setClauses = keys.map((k, i) => `${k} = $${i + 2}`).join(", ");
  const org = await pool.query(
    `UPDATE organizations SET ${setClauses} WHERE id = $1 RETURNING ${TAX_COLUMNS}`,
    [ctx.orgId, ...keys.map((k) => values[k])]
  );

  return NextResponse.json({ organization: org.rows[0] });
}
