import { query } from "@/lib/db";
import { requireSuperAdminPage } from "@/lib/super-admin";
import type { SuperAdminOrgRow } from "@/app/api/super-admin/organizations/route";
import SuperAdminOrgsTable from "@/components/super-admin/SuperAdminOrgsTable";

// Platform-level panel — not org-scoped, so it deliberately bypasses requireActiveContext's
// org-approval gate (a super admin needs to reach this even if every org they personally
// belong to were somehow pending). Reachable via the "Super Admin" link in the Topbar user
// menu, shown only when session.isSuperAdmin is true (see Topbar.tsx).
export default async function SuperAdminPage() {
  await requireSuperAdminPage();

  const organizations = await query<SuperAdminOrgRow>(
    `SELECT o.id, o.name, o.org_seq, o.approval_status, o.approved_at, o.rejection_reason,
            o.subscription_plan, o.max_users, o.disabled_modules, o.created_at,
            (SELECT count(*)::int FROM memberships m WHERE m.organization_id = o.id) AS member_count,
            (SELECT u.email FROM memberships m JOIN users u ON u.id = m.user_id
             WHERE m.organization_id = o.id AND m.role = 'owner' ORDER BY m.created_at ASC LIMIT 1) AS owner_email
     FROM organizations o
     ORDER BY (o.approval_status = 'pending') DESC, o.created_at DESC`
  );

  return (
    <div>
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <h1 className="text-lg font-semibold text-ink-800">Super Admin</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          Approve new organizations, and control each organization&apos;s modules, subscription plan and user limit.
        </p>
      </div>
      <div className="m-6">
        <SuperAdminOrgsTable initialOrganizations={organizations} />
      </div>
    </div>
  );
}
