import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";

export interface SuperAdminOrgRow {
  id: string;
  name: string;
  org_seq: string;
  approval_status: string;
  approved_at: string | null;
  rejection_reason: string | null;
  subscription_plan: string;
  max_users: number | null;
  disabled_modules: string[];
  /** Daily /api/v1 request cap for this org (null = unlimited) — set here, enforced in
   *  src/lib/api-context.ts's checkApiRequestLimit(), and shown read-only to the org's own
   *  Admin/Owner under Settings -> Configurations -> General. */
  api_request_limit_per_day: number | null;
  created_at: string;
  member_count: number;
  owner_email: string | null;
  /** True when this organization's Owner is themselves a Super Admin (e.g. a Super Admin's
   *  own company). Subscription Plan and Suspend Account don't make sense to apply to a Super
   *  Admin's own organization, so the UI hides those controls for a row where this is true. */
  owner_is_super_admin: boolean;
}

/**
 * The single query backing the Super Admin organizations panel — shared by the page's initial
 * server-rendered load and the GET API route used for refreshes, so the two can never drift
 * out of sync with each other (they did, briefly, before this was factored out: the page's own
 * copy was missed when owner_is_super_admin was added).
 */
export async function fetchSuperAdminOrganizations(): Promise<SuperAdminOrgRow[]> {
  return query<SuperAdminOrgRow>(
    `SELECT o.id, o.name, o.org_seq, o.approval_status, o.approved_at, o.rejection_reason,
            o.subscription_plan, o.max_users, o.disabled_modules, o.api_request_limit_per_day, o.created_at,
            (SELECT count(*)::int FROM memberships m WHERE m.organization_id = o.id) AS member_count,
            (SELECT u.email FROM memberships m JOIN users u ON u.id = m.user_id
             WHERE m.organization_id = o.id AND m.role = 'owner' ORDER BY m.created_at ASC LIMIT 1) AS owner_email,
            COALESCE(
              (SELECT u.is_super_admin FROM memberships m JOIN users u ON u.id = m.user_id
               WHERE m.organization_id = o.id AND m.role = 'owner' ORDER BY m.created_at ASC LIMIT 1),
              false
            ) AS owner_is_super_admin
     FROM organizations o
     ORDER BY (o.approval_status = 'pending') DESC, o.created_at DESC`
  );
}

/**
 * Platform-level check — deliberately independent of org membership/role, since a Super
 * Admin (today: only aditya.kishor@gmail.com, per users.is_super_admin) needs to manage
 * every organization regardless of which org they're currently "in".
 */
export async function requireSuperAdminPage(): Promise<{ userId: string }> {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!session.isSuperAdmin) notFound();
  return { userId: session.user.id };
}

/** API-route variant: returns null (caller responds 404, matching the page's notFound()) instead of throwing. */
export async function getSuperAdminApiContext(): Promise<{ userId: string } | null> {
  const session = await auth();
  if (!session?.user || !session.isSuperAdmin) return null;
  return { userId: session.user.id };
}
