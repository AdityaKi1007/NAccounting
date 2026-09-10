import { NextRequest, NextResponse } from "next/server";
import { pool, queryOne } from "@/lib/db";
import { getApiOrgContext, unauthorized } from "@/lib/api-context";

const ORG_COLUMNS = `id, name, currency, fiscal_year_start, industry, location_country, is_designated_zone,
  registration_number, tax_registration_number, address_attention, address_street1, address_street2,
  address_city, address_state, address_zip, address_phone, address_fax, timezone, date_format, report_basis`;

export async function GET() {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();

  const org = await queryOne(`SELECT ${ORG_COLUMNS} FROM organizations WHERE id = $1`, [ctx.orgId]);
  return NextResponse.json({ organization: org });
}

function str(v: unknown, fallback = "") {
  return typeof v === "string" ? v : fallback;
}
function nullableStr(v: unknown) {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
}

export async function PATCH(req: NextRequest) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  if (ctx.role !== "owner" && ctx.role !== "admin") {
    return NextResponse.json({ error: "Only owners and admins can update organization settings." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const name = str(body.name).trim();
  if (!name) {
    return NextResponse.json({ error: "Organization name is required." }, { status: 400 });
  }

  const values = {
    name,
    currency: str(body.currency, "AED"),
    fiscal_year_start: str(body.fiscal_year_start, "01-01"),
    industry: nullableStr(body.industry),
    location_country: str(body.location_country, "United Arab Emirates"),
    is_designated_zone: Boolean(body.is_designated_zone),
    registration_number: nullableStr(body.registration_number),
    tax_registration_number: nullableStr(body.tax_registration_number),
    address_attention: nullableStr(body.address_attention),
    address_street1: nullableStr(body.address_street1),
    address_street2: nullableStr(body.address_street2),
    address_city: nullableStr(body.address_city),
    address_state: nullableStr(body.address_state),
    address_zip: nullableStr(body.address_zip),
    address_phone: nullableStr(body.address_phone),
    address_fax: nullableStr(body.address_fax),
    timezone: str(body.timezone, "Asia/Dubai"),
    date_format: str(body.date_format, "DD/MM/YYYY"),
    report_basis: str(body.report_basis, "accrual"),
  };

  const keys = Object.keys(values) as (keyof typeof values)[];
  const setClauses = keys.map((k, i) => `${k} = $${i + 2}`).join(", ");
  const org = await pool.query(
    `UPDATE organizations SET ${setClauses} WHERE id = $1 RETURNING ${ORG_COLUMNS}`,
    [ctx.orgId, ...keys.map((k) => values[k])]
  );

  return NextResponse.json({ organization: org.rows[0] });
}
