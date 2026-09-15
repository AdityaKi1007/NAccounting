import { NextRequest, NextResponse } from "next/server";
import { pool, query } from "@/lib/db";
import { getApiOrgContext, unauthorized } from "@/lib/api-context";
import { canManageOrgSettings } from "@/lib/module-access";

export async function GET(req: NextRequest) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();

  const docType = req.nextUrl.searchParams.get("doc_type");
  const rows = docType
    ? await query(
        `SELECT * FROM reminder_rules WHERE organization_id = $1 AND doc_type = $2 ORDER BY created_at ASC`,
        [ctx.orgId, docType]
      )
    : await query(`SELECT * FROM reminder_rules WHERE organization_id = $1 ORDER BY created_at ASC`, [ctx.orgId]);

  return NextResponse.json({ reminders: rows });
}

export async function POST(req: NextRequest) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  if (!canManageOrgSettings(ctx)) {
    return NextResponse.json({ error: "Only owners and admins can manage reminders." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const docType = body.doc_type === "bills" ? "bills" : "invoices";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Reminder name is required." }, { status: 400 });

  const triggerBasis = body.trigger_basis === "expected_payment_date" ? "expected_payment_date" : "due_date";
  const direction = body.direction === "before" ? "before" : "after";
  const offsetDays = Number.isFinite(Number(body.offset_days)) ? Math.max(0, Math.trunc(Number(body.offset_days))) : 0;
  const isActive = Boolean(body.is_active);

  const res = await pool.query(
    `INSERT INTO reminder_rules (organization_id, doc_type, name, trigger_basis, offset_days, direction, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [ctx.orgId, docType, name, triggerBasis, offsetDays, direction, isActive]
  );

  return NextResponse.json({ reminder: res.rows[0] }, { status: 201 });
}
