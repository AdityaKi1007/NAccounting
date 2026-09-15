import { NextRequest, NextResponse } from "next/server";
import { pool, queryOne } from "@/lib/db";
import { getApiOrgContext, unauthorized } from "@/lib/api-context";
import { canManageOrgSettings } from "@/lib/module-access";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  if (!canManageOrgSettings(ctx)) {
    return NextResponse.json({ error: "Only owners and admins can manage webhooks." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 2;

  if (typeof body.name === "string" && body.name.trim()) {
    fields.push(`name = $${i++}`);
    values.push(body.name.trim());
  }
  if (body.is_active !== undefined) {
    fields.push(`is_active = $${i++}`);
    values.push(Boolean(body.is_active));
  }
  if (typeof body.default_account_id === "string" && body.default_account_id) {
    const account = await queryOne(`SELECT id FROM accounts WHERE id = $1 AND organization_id = $2`, [
      body.default_account_id,
      ctx.orgId,
    ]);
    if (!account) return NextResponse.json({ error: "That account was not found." }, { status: 400 });
    fields.push(`default_account_id = $${i++}`);
    values.push(body.default_account_id);
  }
  if (body.default_paid_through_account_id !== undefined) {
    const paidThroughId = body.default_paid_through_account_id || null;
    if (paidThroughId) {
      const bankAccount = await queryOne(`SELECT id FROM bank_accounts WHERE id = $1 AND organization_id = $2`, [
        paidThroughId,
        ctx.orgId,
      ]);
      if (!bankAccount) return NextResponse.json({ error: "That paid-through account was not found." }, { status: 400 });
    }
    fields.push(`default_paid_through_account_id = $${i++}`);
    values.push(paidThroughId);
  }

  if (fields.length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const res = await pool.query(
    `UPDATE incoming_webhooks SET ${fields.join(", ")} WHERE id = $1 AND organization_id = $${i} RETURNING *`,
    [params.id, ...values, ctx.orgId]
  );

  if (res.rowCount === 0) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ webhook: res.rows[0] });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  if (!canManageOrgSettings(ctx)) {
    return NextResponse.json({ error: "Only owners and admins can manage webhooks." }, { status: 403 });
  }

  await pool.query(`DELETE FROM incoming_webhooks WHERE id = $1 AND organization_id = $2`, [params.id, ctx.orgId]);
  return NextResponse.json({ ok: true });
}
