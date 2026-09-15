import { NextRequest, NextResponse } from "next/server";
import { pool, queryOne } from "@/lib/db";
import { getApiOrgContext, unauthorized } from "@/lib/api-context";
import { canManageOrgSettings } from "@/lib/module-access";
import { normalizeSubdomain, subdomainValidationError } from "@/lib/custom-domain";

const CUSTOM_DOMAIN_COLUMNS = `id, custom_domain_subdomain, custom_domain_enabled`;

export async function GET() {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();

  const org = await queryOne(`SELECT ${CUSTOM_DOMAIN_COLUMNS} FROM organizations WHERE id = $1`, [ctx.orgId]);
  return NextResponse.json({ organization: org });
}

// PATCH body: { subdomain: string | null, enabled: boolean }
// subdomain: null/"" clears it (and forces enabled off, below). A non-null value is validated
// (format + reserved list) and checked for a case-insensitive clash against every OTHER
// organization on the platform (never just this one) before being saved.
export async function PATCH(req: NextRequest) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  if (!canManageOrgSettings(ctx)) {
    return NextResponse.json({ error: "Only owners, admins, and Super Admin can change the custom domain." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const rawSubdomain = typeof body.subdomain === "string" ? body.subdomain : null;
  const requestedEnabled = Boolean(body.enabled);

  // Clearing the subdomain also turns it off — there's nothing to serve a portal at once the
  // slug itself is gone, and keeping enabled=true with no subdomain would be a confusing,
  // meaningless saved state.
  if (!rawSubdomain || !rawSubdomain.trim()) {
    const cleared = await pool.query(
      `UPDATE organizations SET custom_domain_subdomain = NULL, custom_domain_enabled = false
       WHERE id = $1 RETURNING ${CUSTOM_DOMAIN_COLUMNS}`,
      [ctx.orgId]
    );
    return NextResponse.json({ organization: cleared.rows[0] });
  }

  const subdomain = normalizeSubdomain(rawSubdomain);
  const validationError = subdomainValidationError(subdomain);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const clash = await queryOne<{ id: string }>(
    `SELECT id FROM organizations WHERE lower(custom_domain_subdomain) = $1 AND id != $2`,
    [subdomain, ctx.orgId]
  );
  if (clash) {
    return NextResponse.json({ error: `"${subdomain}" is already taken by another organization.` }, { status: 409 });
  }

  try {
    const updated = await pool.query(
      `UPDATE organizations SET custom_domain_subdomain = $2, custom_domain_enabled = $3
       WHERE id = $1 RETURNING ${CUSTOM_DOMAIN_COLUMNS}`,
      [ctx.orgId, subdomain, requestedEnabled]
    );
    return NextResponse.json({ organization: updated.rows[0] });
  } catch (err) {
    // Belt-and-suspenders against the pre-check above racing a concurrent request for the
    // same subdomain — the partial unique index (organizations_custom_domain_subdomain_unique)
    // is the actual source of truth.
    if (err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "23505") {
      return NextResponse.json({ error: `"${subdomain}" is already taken by another organization.` }, { status: 409 });
    }
    throw err;
  }
}
