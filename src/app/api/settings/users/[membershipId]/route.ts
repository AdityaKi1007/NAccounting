import { NextRequest, NextResponse } from "next/server";
import { pool, queryOne } from "@/lib/db";
import { getApiOrgContext, unauthorized } from "@/lib/api-context";

// Custom roles (role_permissions) have been retired from this app — it now only offers the
// standard owner/admin/staff roles. This endpoint used to assign/clear a custom Role on a
// membership; it's kept only to unconditionally clear any role_id a membership may already
// carry from before that retirement, so nothing can reintroduce a custom-role assignment
// (including a raw API call) even though the UI no longer offers one.
export async function PATCH(
  _req: NextRequest,
  { params }: { params: { membershipId: string } }
) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  if (ctx.role !== "owner" && ctx.role !== "admin") {
    return NextResponse.json({ error: "Only owners and admins can change a member's role." }, { status: 403 });
  }

  const membership = await queryOne<{ role: string }>(
    `SELECT role FROM memberships WHERE id = $1 AND organization_id = $2`,
    [params.membershipId, ctx.orgId]
  );
  if (!membership) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await pool.query(`UPDATE memberships SET role_id = NULL WHERE id = $1 AND organization_id = $2`, [
    params.membershipId,
    ctx.orgId,
  ]);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { membershipId: string } }
) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  if (ctx.role !== "owner" && ctx.role !== "admin") {
    return NextResponse.json({ error: "Only owners and admins can remove users." }, { status: 403 });
  }

  const membership = await queryOne<{ role: string }>(
    `SELECT role FROM memberships WHERE id = $1 AND organization_id = $2`,
    [params.membershipId, ctx.orgId]
  );
  if (!membership) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (membership.role === "owner") {
    return NextResponse.json({ error: "The organization owner can't be removed." }, { status: 400 });
  }

  await pool.query(`DELETE FROM memberships WHERE id = $1 AND organization_id = $2`, [
    params.membershipId,
    ctx.orgId,
  ]);
  return NextResponse.json({ ok: true });
}
