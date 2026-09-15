import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getApiOrgContext, unauthorized } from "@/lib/api-context";
import { canManageOrgSettings } from "@/lib/module-access";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  if (!canManageOrgSettings(ctx)) {
    return NextResponse.json({ error: "Only owners and admins can manage reminders." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 2;

  if (typeof body.name === "string" && body.name.trim()) {
    fields.push(`name = $${i++}`);
    values.push(body.name.trim());
  }
  if (body.trigger_basis === "due_date" || body.trigger_basis === "expected_payment_date") {
    fields.push(`trigger_basis = $${i++}`);
    values.push(body.trigger_basis);
  }
  if (body.direction === "before" || body.direction === "after") {
    fields.push(`direction = $${i++}`);
    values.push(body.direction);
  }
  if (body.offset_days !== undefined && Number.isFinite(Number(body.offset_days))) {
    fields.push(`offset_days = $${i++}`);
    values.push(Math.max(0, Math.trunc(Number(body.offset_days))));
  }
  if (body.is_active !== undefined) {
    fields.push(`is_active = $${i++}`);
    values.push(Boolean(body.is_active));
  }

  if (fields.length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const res = await pool.query(
    `UPDATE reminder_rules SET ${fields.join(", ")} WHERE id = $1 AND organization_id = $${i} RETURNING *`,
    [params.id, ...values, ctx.orgId]
  );

  if (res.rowCount === 0) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ reminder: res.rows[0] });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  if (!canManageOrgSettings(ctx)) {
    return NextResponse.json({ error: "Only owners and admins can manage reminders." }, { status: 403 });
  }

  await pool.query(`DELETE FROM reminder_rules WHERE id = $1 AND organization_id = $2`, [params.id, ctx.orgId]);
  return NextResponse.json({ ok: true });
}
