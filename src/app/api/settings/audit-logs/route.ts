import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getApiOrgContext, unauthorized } from "@/lib/api-context";
import { canManageOrgSettings } from "@/lib/module-access";
import { AUDITED_MODULES } from "@/lib/audit-log";

// GET /api/settings/audit-logs — paginated, filterable read of this organization's audit
// trail (audit_log table). Owner/Admin only, per the account owner's explicit answer when this
// feature was scoped — everyone else gets a 403 here even if they somehow reach the page
// (the settings page itself also gates the view, this is the defense-in-depth copy of that
// check, same "page redirects/hides, API still enforces" pattern as module-access.ts).
//
// Query params (all optional):
//   module     - one of AUDITED_MODULES (invoices, payments-received, customers, ...)
//   action     - "create" | "update" | "delete"
//   userId     - filter to changes made by one signed-in user
//   dateFrom   - inclusive, "YYYY-MM-DD"
//   dateTo     - inclusive, "YYYY-MM-DD"
//   limit      - default 50, max 200
//   offset     - default 0
export async function GET(req: NextRequest) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  if (!canManageOrgSettings(ctx)) {
    return NextResponse.json({ error: "Audit logs are visible to Owner and Admin only." }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const moduleFilter = sp.get("module");
  const actionFilter = sp.get("action");
  const userIdFilter = sp.get("userId");
  const dateFrom = sp.get("dateFrom");
  const dateTo = sp.get("dateTo");
  const limit = Math.min(Math.max(Number(sp.get("limit")) || 50, 1), 200);
  const offset = Math.max(Number(sp.get("offset")) || 0, 0);

  const conditions: string[] = ["al.organization_id = $1"];
  const params: unknown[] = [ctx.orgId];

  if (moduleFilter && AUDITED_MODULES.includes(moduleFilter)) {
    params.push(moduleFilter);
    conditions.push(`al.module = $${params.length}`);
  }
  if (actionFilter && ["create", "update", "delete"].includes(actionFilter)) {
    params.push(actionFilter);
    conditions.push(`al.action = $${params.length}`);
  }
  if (userIdFilter) {
    params.push(userIdFilter);
    conditions.push(`al.user_id = $${params.length}`);
  }
  if (dateFrom) {
    params.push(dateFrom);
    conditions.push(`al.created_at >= $${params.length}::date`);
  }
  if (dateTo) {
    // Inclusive of the whole end day.
    params.push(dateTo);
    conditions.push(`al.created_at < ($${params.length}::date + interval '1 day')`);
  }

  const where = conditions.join(" AND ");
  params.push(limit, offset);

  const rows = await query(
    `SELECT al.id, al.action, al.module, al.entity_id, al.entity_label, al.old_data, al.new_data,
            al.changed_fields, al.created_at, al.user_id, al.api_key_id,
            u.name AS user_name, u.email AS user_email,
            ak.name AS api_key_name,
            count(*) OVER() AS total_count
     FROM audit_log al
     LEFT JOIN users u ON u.id = al.user_id
     LEFT JOIN api_keys ak ON ak.id = al.api_key_id
     WHERE ${where}
     ORDER BY al.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  const total = rows.length > 0 ? Number((rows[0] as { total_count: string }).total_count) : 0;
  const data = rows.map((r) => {
    const { total_count, ...rest } = r as Record<string, unknown> & { total_count: string };
    void total_count;
    return rest;
  });

  return NextResponse.json({ data, total, limit, offset });
}
