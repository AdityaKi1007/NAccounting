import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getApiOrgContext, unauthorized } from "@/lib/api-context";
import { canManageOrgSettings } from "@/lib/module-access";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  if (!canManageOrgSettings(ctx)) {
    return NextResponse.json({ error: "Only owners and admins can manage API keys." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  if (body.is_active === undefined) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const res = await pool.query(
    `UPDATE api_keys SET is_active = $1 WHERE id = $2 AND organization_id = $3
     RETURNING id, name, key_prefix, is_active, last_used_at, request_count, created_at`,
    [Boolean(body.is_active), params.id, ctx.orgId]
  );

  if (res.rowCount === 0) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ key: res.rows[0] });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  if (!canManageOrgSettings(ctx)) {
    return NextResponse.json({ error: "Only owners and admins can manage API keys." }, { status: 403 });
  }

  await pool.query(`DELETE FROM api_keys WHERE id = $1 AND organization_id = $2`, [params.id, ctx.orgId]);
  return NextResponse.json({ ok: true });
}
