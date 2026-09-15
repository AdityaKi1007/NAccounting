import { NextRequest, NextResponse } from "next/server";
import { pool, query, queryOne } from "@/lib/db";
import { getApiOrgContext, unauthorized } from "@/lib/api-context";
import { canManageOrgSettings } from "@/lib/module-access";
import { MODULE_KEYS } from "@/lib/modules";
import { isAccessLevel, legacyFlagsOf } from "@/lib/access-levels";

async function requireRoleInOrg(roleId: string, orgId: string) {
  return queryOne(`SELECT id FROM roles WHERE id = $1 AND organization_id = $2`, [roleId, orgId]);
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();

  const role = await requireRoleInOrg(params.id, ctx.orgId);
  if (!role) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rows = await query<{ module_key: string; access_level: string }>(
    `SELECT module_key, access_level FROM role_permissions WHERE role_id = $1`,
    [params.id]
  );
  return NextResponse.json({ permissions: rows });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  if (!canManageOrgSettings(ctx)) {
    return NextResponse.json({ error: "Only owners and admins can edit role permissions." }, { status: 403 });
  }

  const role = await requireRoleInOrg(params.id, ctx.orgId);
  if (!role) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const permissions = body.permissions as Record<string, string> | undefined;
  if (!permissions || typeof permissions !== "object") {
    return NextResponse.json({ error: "Invalid permissions payload." }, { status: 400 });
  }

  // Every value must be one of the 10 known access levels — reject the whole payload rather
  // than silently coercing an unrecognized value to "no_access", since that would be a much
  // more dangerous default failure mode for a permissions endpoint (a bad value should
  // surface as an error, not quietly lock someone out or leave a stale wider grant in place).
  const entries = Object.entries(permissions).filter(([key]) => MODULE_KEYS.has(key));
  for (const [, level] of entries) {
    if (!isAccessLevel(level)) {
      return NextResponse.json({ error: `Invalid access level: ${level}` }, { status: 400 });
    }
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Replace-in-full: simplest way to keep this in sync with exactly what the matrix UI
    // shows (a module absent from the payload, or "no_access", just isn't stored —
    // module-access.ts already treats "no row" as denied for a role, same as no_access).
    await client.query(`DELETE FROM role_permissions WHERE role_id = $1`, [params.id]);
    for (const [moduleKey, level] of entries) {
      if (level === "no_access") continue;
      const { can_view, can_write } = legacyFlagsOf(level);
      await client.query(
        `INSERT INTO role_permissions (role_id, module_key, access_level, can_view, can_write) VALUES ($1, $2, $3, $4, $5)`,
        [params.id, moduleKey, level, can_view, can_write]
      );
    }
    await client.query("COMMIT");
    return NextResponse.json({ ok: true });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    return NextResponse.json({ error: "Could not save permissions." }, { status: 500 });
  } finally {
    client.release();
  }
}
