import { NextRequest, NextResponse } from "next/server";
import { pool, queryOne } from "@/lib/db";
import { getApiOrgContext, unauthorized } from "@/lib/api-context";

// Backs the "Enable Multiple Transaction Series" toggle on the Transaction Number Series
// settings page. This build implements only a single ("Default") series per module — the
// toggle just records the org's preference so the page can explain that limitation, rather
// than silently doing nothing when switched on.
export async function GET() {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();

  const org = await queryOne<{ multiple_transaction_series_enabled: boolean }>(
    `SELECT multiple_transaction_series_enabled FROM organizations WHERE id = $1`,
    [ctx.orgId]
  );
  return NextResponse.json({ enabled: Boolean(org?.multiple_transaction_series_enabled) });
}

export async function PATCH(req: NextRequest) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  if (ctx.role !== "owner" && ctx.role !== "admin") {
    return NextResponse.json({ error: "Only owners and admins can change this setting." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const enabled = Boolean(body.enabled);

  await pool.query(`UPDATE organizations SET multiple_transaction_series_enabled = $1 WHERE id = $2`, [
    enabled,
    ctx.orgId,
  ]);

  return NextResponse.json({ enabled });
}
