import { requireSuperAdminPage, fetchSuperAdminOrganizations } from "@/lib/super-admin";
import SuperAdminOrgsTable from "@/components/super-admin/SuperAdminOrgsTable";

// Platform-level panel — not org-scoped, so it deliberately bypasses requireActiveContext's
// org-approval gate (a super admin needs to reach this even if every org they personally
// belong to were somehow pending). Reachable via the "Super Admin" link in the Topbar user
// menu, shown only when session.isSuperAdmin is true (see Topbar.tsx).
export default async function SuperAdminPage() {
  await requireSuperAdminPage();

  const organizations = await fetchSuperAdminOrganizations();

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
