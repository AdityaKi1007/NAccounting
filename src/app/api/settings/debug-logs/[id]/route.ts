import { NextResponse } from "next/server";
import { getApiOrgContext, unauthorized } from "@/lib/api-context";
import { deleteDebugLog } from "@/lib/debug-logs";

function canManageDebugLogs(ctx: { role: string; isSuperAdmin: boolean }) {
  return ctx.role === "owner" || ctx.role === "admin" || ctx.isSuperAdmin;
}

// DELETE /api/settings/debug-logs/{id} — deletes a single log entry. Owner/Admin/Super Admin
// only, same gate as the collection route.
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  if (!canManageDebugLogs(ctx)) {
    return NextResponse.json({ error: "Only Owner, Admin and Super Admin can delete logs." }, { status: 403 });
  }

  const deleted = await deleteDebugLog(ctx.orgId, params.id);
  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
