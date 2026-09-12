import { NextRequest, NextResponse } from "next/server";
import { pool, query, queryOne } from "@/lib/db";
import { getApiOrgContext, unauthorized } from "@/lib/api-context";
import { MODULE_KEYS } from "@/lib/modules";

async function requireRoleInOrg(roleId: string, orgId: string) {
  return queryOne(`SELECT id FROM roles WHERE id = $1 AND organization_id = $2`, [roleId, orgId]);
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();

  const role = await requireRoleInOrg(params.id, ctx.orgId);
  if (!role) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rows = await query<{ module_key: string; can_view: boolean; can_write: boolean }>(
    `SELECT module_key, can_view, can_write FROM role_permissions WHERE role_id = $1`,
    [params.id]
  );
  return NextResponse.json({ permissions: rows });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  if (ctx.role !== "owner" && ctx.role !== "admin") {
    return NextResponse.json({ error: "Only owners and admins can edit role permissions." }, { status: 403 });
  }

  const role = await requireRoleInOrg(params.id, ctx.orgId);
  if (!role) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const permissions = body.permissions as Record<string, { can_view?: boolean; can_write?: boolean }> | undefined;
  if (!permissions || typeof permissions !== "object") {
    return NextResponse.json({ error: "Invalid permissions payload." }, { status: 400 });
  }

  const entries = Object.entries(permissions).filter(([key]) => MODULE_KEYS.has(key));

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Replace-in-full: simplest way to keep this in sync with exactly what the matrix UI
    // shows (a module absent from the payload, or with both flags false, just isn't stored —
    // module-access.ts already treats "no row" as denied for a role, same as can_view=false).
    await client.query(`DELETE FROM role_permissions WHERE role_id = $1`, [params.id]);
    for (const [moduleKey, perm] of entries) {
      const canView = Boolean(perm.can_view);
      const canWrite = Boolean(perm.can_write);
      if (!canView && !canWrite) continue;
      await client.query(
        `INSERT INTO role_permissions (role_id, module_key, can_view, can_write) VALUES ($1, $2, $3, $4)`,
        [params.id, moduleKey, canView, canWrite]
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
