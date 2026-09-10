import { NextRequest, NextResponse } from "next/server";
import { pool, query, queryOne } from "@/lib/db";
import { getApiOrgContext, unauthorized } from "@/lib/api-context";
import { nanoid } from "nanoid";
import bcrypt from "bcryptjs";

export async function GET() {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();

  const rows = await query(
    `SELECT m.id AS membership_id, m.role, m.created_at AS joined_at, u.id AS user_id, u.name, u.email
     FROM memberships m
     JOIN users u ON u.id = m.user_id
     WHERE m.organization_id = $1
     ORDER BY m.created_at ASC`,
    [ctx.orgId]
  );
  return NextResponse.json({ users: rows });
}

const ROLES = ["owner", "admin", "staff"];

export async function POST(req: NextRequest) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  if (ctx.role !== "owner" && ctx.role !== "admin") {
    return NextResponse.json({ error: "Only owners and admins can invite users." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const role = ROLES.includes(body.role) ? body.role : "staff";

  if (!email) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let user = await queryOne<{ id: string }>(`SELECT id FROM users WHERE email = $1`, [email]);
    let tempPassword: string | null = null;

    if (!user) {
      tempPassword = nanoid(12);
      const passwordHash = await bcrypt.hash(tempPassword, 10);
      const result = await client.query(
        `INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id`,
        [email, passwordHash, name || email.split("@")[0]]
      );
      user = result.rows[0];
    }

    const existingMembership = await queryOne(
      `SELECT id FROM memberships WHERE user_id = $1 AND organization_id = $2`,
      [user!.id, ctx.orgId]
    );
    if (existingMembership) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "This person is already a member of this organization." }, { status: 409 });
    }

    await client.query(
      `INSERT INTO memberships (user_id, organization_id, role) VALUES ($1, $2, $3)`,
      [user!.id, ctx.orgId, role]
    );

    await client.query("COMMIT");
    return NextResponse.json({ ok: true, tempPassword }, { status: 201 });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    return NextResponse.json({ error: "Could not add this user." }, { status: 500 });
  } finally {
    client.release();
  }
}
