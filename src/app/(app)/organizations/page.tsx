import { requireActiveContext } from "@/lib/session";
import { query } from "@/lib/db";
import OrganizationsManager from "@/components/organizations/OrganizationsManager";

interface OrgRow {
  id: string;
  name: string;
  org_seq: string;
  location_country: string;
  created_at: string;
  role: string;
}

export default async function OrganizationsPage() {
  const ctx = await requireActiveContext();

  // Oldest membership first — this is also how auth.ts picks the org a fresh login lands
  // on when no activeOrgId is set yet, so it doubles as this list's "default" org.
  const rows = await query<OrgRow>(
    `SELECT o.id, o.name, o.org_seq, o.location_country, o.created_at, m.role
     FROM memberships m
     JOIN organizations o ON o.id = m.organization_id
     WHERE m.user_id = $1
     ORDER BY m.created_at ASC`,
    [ctx.userId]
  );

  return (
    <OrganizationsManager
      greetingName={ctx.orgName}
      activeOrgId={ctx.orgId}
      organizations={rows.map((r, i) => ({
        id: r.id,
        name: r.name,
        orgSeq: r.org_seq,
        locationCountry: r.location_country,
        createdAt: r.created_at,
        role: r.role,
        isDefault: i === 0,
      }))}
    />
  );
}
