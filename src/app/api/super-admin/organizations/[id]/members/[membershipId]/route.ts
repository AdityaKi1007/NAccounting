import { NextRequest, NextResponse } from "next/server";
import { pool, queryOne } from "@/lib/db";
import { getSuperAdminApiContext } from "@/lib/super-admin";

// Lets the Super Admin designate which existing member of an already-approved organization
// holds its 'admin' role — the "Super Admin should be able to add one admin for the company"
// half of that request, scoped down (per the user's own decision) to picking an admin from
// among the org's self-signed-up members rather than provisioning a new account directly.
// Only ever toggles between 'admin' and 'staff': the org's 'owner' membership (set at
// signup) is left alone here — ownership transfer is a bigger, separate concern than this
// feature and isn't part of what was asked for.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; membershipId: string } }
) {
  const ctx = await getSuperAdminApiContext();
  if (!ctx) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const membership = await queryOne<{ role: string }>(
    `SELECT role FROM memberships WHERE id = $1 AND organization_id = $2`,
    [params.membershipId, params.id]
  );
  if (!membership) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (membership.role === "owner") {
    return NextResponse.json({ error: "The organization's owner can't be changed here." }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const role = body.role;
  if (role !== "admin" && role !== "staff") {
    return NextResponse.json({ error: "Role must be 'admin' or 'staff'." }, { status: 400 });
  }

  await pool.query(`UPDATE memberships SET role = $1 WHERE id = $2 AND organization_id = $3`, [
    role,
    params.membershipId,
    params.id,
  ]);
  return NextResponse.json({ ok: true });
}
