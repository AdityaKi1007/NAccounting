import { NextRequest, NextResponse } from "next/server";
import { pool, queryOne } from "@/lib/db";
import { getApiOrgContext, unauthorized } from "@/lib/api-context";

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
