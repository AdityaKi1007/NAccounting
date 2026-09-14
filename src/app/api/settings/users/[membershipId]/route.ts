import { NextRequest, NextResponse } from "next/server";
import { pool, queryOne } from "@/lib/db";
import { getApiOrgContext, unauthorized } from "@/lib/api-context";

// Custom roles (role_permissions) were retired 2026-09-13, then reintroduced 2026-09-14 for
// the Access Matrix feature (see that addendum doc) — this endpoint is back to assigning or
// clearing a membership's custom role_id, same shape as the original 2026-09-12 version.
// `roleId` is optional in the body: omit it to leave role_id untouched (e.g. a request that's
// only reassigning the standard owner/admin/staff `role`, once this route supports that too),
// pass a real role id owned by this org to assign it, or pass null explicitly to clear it back
// to "unrestricted" (today's default for every membership).
export async function PATCH(
  req: NextRequest,
  { params }: { params: { membershipId: string } }
) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  if (ctx.role !== "owner" && ctx.role !== "admin" && !ctx.isSuperAdmin) {
    return NextResponse.json({ error: "Only owners and admins can change a member's role." }, { status: 403 });
  }

  const membership = await queryOne<{ role: string }>(
    `SELECT role FROM memberships WHERE id = $1 AND organization_id = $2`,
    [params.membershipId, ctx.orgId]
  );
  if (!membership) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  if (!("roleId" in body)) {
    // No-op PATCH (kept for compatibility with any caller that hits this route without a
    // body) — nothing to change.
    return NextResponse.json({ ok: true });
  }

  const roleId = body.roleId as string | null;
  if (roleId !== null) {
    const role = await queryOne(`SELECT id FROM roles WHERE id = $1 AND organization_id = $2`, [
      roleId,
      ctx.orgId,
    ]);
    if (!role) return NextResponse.json({ error: "That role doesn't belong to this organization." }, { status: 400 });
  }

  await pool.query(`UPDATE memberships SET role_id = $1 WHERE id = $2 AND organization_id = $3`, [
    roleId,
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
