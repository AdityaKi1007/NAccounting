import { NextRequest, NextResponse } from "next/server";
import { pool, query } from "@/lib/db";
import { getApiOrgContext, unauthorized } from "@/lib/api-context";
import { canManageOrgSettings } from "@/lib/module-access";
import { generateApiKey } from "@/lib/api-keys";

export async function GET() {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();

  const keys = await query(
    `SELECT id, name, key_prefix, is_active, last_used_at, request_count, created_at
     FROM api_keys WHERE organization_id = $1 ORDER BY created_at ASC`,
    [ctx.orgId]
  );

  return NextResponse.json({ keys });
}

export async function POST(req: NextRequest) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  if (!canManageOrgSettings(ctx)) {
    return NextResponse.json({ error: "Only owners and admins can create API keys." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Key name is required." }, { status: 400 });

  const { raw, prefix, hash } = generateApiKey();

  const res = await pool.query(
    `INSERT INTO api_keys (organization_id, name, key_prefix, key_hash, created_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, name, key_prefix, is_active, last_used_at, request_count, created_at`,
    [ctx.orgId, name, prefix, hash, ctx.userId]
  );

  // The only moment the raw key is ever returned — the client must show it once and discard it.
  return NextResponse.json({ key: res.rows[0], rawKey: raw }, { status: 201 });
}
