import { NextRequest, NextResponse } from "next/server";
import { pool, queryOne } from "@/lib/db";
import { getApiOrgContext, unauthorized } from "@/lib/api-context";
import { canManageOrgSettings } from "@/lib/module-access";

export async function GET() {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();

  const org = await queryOne(`SELECT id, profit_margin_scheme_enabled FROM organizations WHERE id = $1`, [
    ctx.orgId,
  ]);
  return NextResponse.json({ organization: org });
}

export async function PATCH(req: NextRequest) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  if (!canManageOrgSettings(ctx)) {
    return NextResponse.json({ error: "Only owners and admins can update tax preferences." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const org = await pool.query(
    `UPDATE organizations SET profit_margin_scheme_enabled = $2 WHERE id = $1
     RETURNING id, profit_margin_scheme_enabled`,
    [ctx.orgId, Boolean(body.profit_margin_scheme_enabled)]
  );

  return NextResponse.json({ organization: org.rows[0] });
}
