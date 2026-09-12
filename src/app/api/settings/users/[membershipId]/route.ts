import { NextRequest, NextResponse } from "next/server";
import { pool, queryOne } from "@/lib/db";
import { getApiOrgContext, unauthorized } from "@/lib/api-context";

// Assigns (or clears) a custom Role — and, through it, that role's role_permissions matrix —
// on an existing 'staff' membership. A null roleId restores today's unrestricted staff
// behavior (see src/lib/module-access.ts). owner/admin memberships ignore role_id entirely
// (they're always full-access), so this is a no-op there beyond storing the value.
export async function PATCH(
  req: NextRequest,
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

  const body = await req.json().catch(() => ({}));
  const roleId = typeof body.roleId === "string" && body.roleId ? body.roleId : null;

  if (roleId) {
    const roleRow = await queryOne(`SELECT id FROM roles WHERE id = $1 AND organization_id = $2`, [roleId, ctx.orgId]);
    if (!roleRow) return NextResponse.json({ error: "Unknown role." }, { status: 400 });
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
