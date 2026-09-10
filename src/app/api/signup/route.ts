import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { pool, queryOne } from "@/lib/db";
import { provisionOrganization } from "@/lib/org-provisioning";

const schema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  organizationName: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.data ?? "Invalid input" }, { status: 400 });
  }
  const { name, email, password, organizationName } = parsed.data;
  const normalizedEmail = email.trim().toLowerCase();

  const existing = await queryOne(`SELECT id FROM users WHERE email = $1`, [normalizedEmail]);
  if (existing) {
    return NextResponse.json({ error: "An account with that email already exists." }, { status: 409 });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const passwordHash = await bcrypt.hash(password, 10);
    const userResult = await client.query(
      `INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id`,
      [normalizedEmail, passwordHash, name]
    );
    const userId = userResult.rows[0].id;

    await provisionOrganization(client, { userId, organizationName, role: "owner" });

    await client.query("COMMIT");
    return NextResponse.json({ ok: true });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    return NextResponse.json({ error: "Could not create account." }, { status: 500 });
  } finally {
    client.release();
  }
}
