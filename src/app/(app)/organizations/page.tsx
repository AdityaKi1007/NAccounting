import { notFound } from "next/navigation";
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

  // 2026-09-15: "keep manage option only for super admin" — the Topbar's org-switcher
  // "Manage" link (Topbar.tsx) is already hidden from everyone else; this is the matching
  // server-side check so a direct/bookmarked visit to /organizations can't bypass that, same
  // notFound() pattern the platform-wide Super Admin page itself uses (requireSuperAdminPage
  // in src/lib/super-admin.ts) rather than a bespoke redirect here.
  if (!ctx.isSuperAdmin) notFound();

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
