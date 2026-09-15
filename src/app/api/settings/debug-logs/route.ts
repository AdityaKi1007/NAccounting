import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getApiOrgContext, unauthorized } from "@/lib/api-context";
import { getDebugLogs, clearDebugLogs } from "@/lib/debug-logs";

// Owner/Admin/Super Admin only — same gate as Access Matrix (canManageAccessMatrix in the
// settings page), per the request: "enable option to delete logs by admin and super admin."
// Viewing and toggling the Enable Debug Logs switch are held to the same bar as deleting,
// since a debug log can carry stack traces and request context that's more sensitive than an
// ordinary audit-trail entry.
function canManageDebugLogs(ctx: { role: string; isSuperAdmin: boolean }) {
  return ctx.role === "owner" || ctx.role === "admin" || ctx.isSuperAdmin;
}

// GET /api/settings/debug-logs — paginated list for this organization.
//   Query params: source ("server" | "client"), limit (default 50, max 200), offset (default 0).
export async function GET(req: NextRequest) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  if (!canManageDebugLogs(ctx)) {
    return NextResponse.json({ error: "Debug Logs are visible to Owner, Admin and Super Admin only." }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const source = sp.get("source") ?? undefined;
  const limit = sp.get("limit") ? Number(sp.get("limit")) : undefined;
  const offset = sp.get("offset") ? Number(sp.get("offset")) : undefined;

  const { data, total } = await getDebugLogs(ctx.orgId, { limit, offset, source });
  return NextResponse.json({ data, total });
}

// PATCH /api/settings/debug-logs — { debug_logs_enabled: boolean } toggle.
export async function PATCH(req: NextRequest) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  if (!canManageDebugLogs(ctx)) {
    return NextResponse.json({ error: "Only Owner, Admin and Super Admin can change this." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  if (typeof body.debug_logs_enabled !== "boolean") {
    return NextResponse.json({ error: "debug_logs_enabled must be a boolean." }, { status: 400 });
  }

  await pool.query(`UPDATE organizations SET debug_logs_enabled = $1 WHERE id = $2`, [body.debug_logs_enabled, ctx.orgId]);
  return NextResponse.json({ debug_logs_enabled: body.debug_logs_enabled });
}

// DELETE /api/settings/debug-logs — clears every log entry for this org ("Clear All").
export async function DELETE() {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  if (!canManageDebugLogs(ctx)) {
    return NextResponse.json({ error: "Only Owner, Admin and Super Admin can delete logs." }, { status: 403 });
  }

  const deleted = await clearDebugLogs(ctx.orgId);
  return NextResponse.json({ deleted });
}
