import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { queryOne } from "@/lib/db";

export interface ActiveContext {
  userId: string;
  userName: string;
  userEmail: string;
  orgId: string;
  orgName: string;
  role: string;
  // Custom role assigned via the per-org Roles feature, for the active org's membership only
  // — null means "no custom role assigned", i.e. today's unrestricted owner/admin/staff
  // behavior (see src/lib/module-access.ts).
  roleId: string | null;
  memberships: { organizationId: string; organizationName: string; role: string }[];
  isSuperAdmin: boolean;
}

/**
 * Requires a logged-in user with at least one organization; redirects to /login otherwise.
 * Also enforces the org-approval gate: every org that already existed when this feature
 * shipped was grandfathered to 'approved' in the migration, so this only ever redirects a
 * brand-new org (created via signup or "+ New Organization", both default to 'pending') that
 * a super admin hasn't approved yet. Super admins bypass this so they can always reach the
 * app — including the approval panel itself — regardless of their own orgs' status.
 */
export async function requireActiveContext(): Promise<ActiveContext> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  const memberships = session.memberships ?? [];
  if (memberships.length === 0) {
    redirect("/onboarding");
  }
  const activeOrgId = session.activeOrgId ?? memberships[0].organizationId;
  const active = memberships.find((m) => m.organizationId === activeOrgId) ?? memberships[0];
  const isSuperAdmin = session.isSuperAdmin ?? false;

  if (!isSuperAdmin) {
    const org = await queryOne<{ approval_status: string }>(
      `SELECT approval_status FROM organizations WHERE id = $1`,
      [active.organizationId]
    );
    if (org && org.approval_status !== "approved") {
      redirect("/pending-approval");
    }
  }

  return {
    userId: session.user.id,
    userName: session.user.name ?? "",
    userEmail: session.user.email ?? "",
    orgId: active.organizationId,
    orgName: active.organizationName,
    role: active.role,
    roleId: active.roleId,
    memberships,
    isSuperAdmin,
  };
}
