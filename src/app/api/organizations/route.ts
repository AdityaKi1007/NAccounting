import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { getApiOrgContext, unauthorized } from "@/lib/api-context";
import { provisionOrganization } from "@/lib/org-provisioning";

const schema = z.object({ organizationName: z.string().min(1), locationCountry: z.string().min(1) });

// Adds another organization for the already-signed-in user (the "+ New Organization" flow
// on the Manage Organizations page) — same seed data as signup, just without creating a
// new user. The caller becomes that org's owner, same as whoever signs up fresh.
export async function POST(req: NextRequest) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Organization name and location are required." }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const orgId = await provisionOrganization(client, {
      userId: ctx.userId,
      organizationName: parsed.data.organizationName,
      locationCountry: parsed.data.locationCountry,
      role: "owner",
    });
    await client.query("COMMIT");
    return NextResponse.json({ id: orgId }, { status: 201 });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    return NextResponse.json({ error: "Could not create organization." }, { status: 500 });
  } finally {
    client.release();
  }
}
