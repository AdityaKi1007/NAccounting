import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";
import PendingApprovalActions from "@/components/PendingApprovalActions";

// Landing spot for requireActiveContext()'s org-approval redirect (see src/lib/session.ts).
// Deliberately lives outside the (app) route group so it does NOT go through
// (app)/layout.tsx — that layout itself calls requireActiveContext(), which would just
// bounce straight back here for a pending org, and to /login for a signed-out user.
export default async function PendingApprovalPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.isSuperAdmin) redirect("/");

  const memberships = session.memberships ?? [];
  if (memberships.length === 0) redirect("/login");

  const activeOrgId = session.activeOrgId ?? memberships[0].organizationId;
  const orgIds = memberships.map((m) => m.organizationId);
  const orgs = await query<{ id: string; approval_status: string }>(
    `SELECT id, approval_status FROM organizations WHERE id = ANY($1::uuid[])`,
    [orgIds]
  );
  const statusByOrg = new Map(orgs.map((o) => [o.id, o.approval_status]));

  // If the active org has since been approved (e.g. this page was reached from a stale tab,
  // or a super admin approved it while the user was sitting here), there's nothing left to
  // show — send them back into the app.
  if (statusByOrg.get(activeOrgId) === "approved") {
    redirect("/");
  }

  const activeMembership = memberships.find((m) => m.organizationId === activeOrgId) ?? memberships[0];
  const otherApproved = memberships
    .filter((m) => m.organizationId !== activeOrgId && statusByOrg.get(m.organizationId) === "approved")
    .map((m) => ({ organizationId: m.organizationId, organizationName: m.organizationName }));

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-900 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-lg bg-brand-600 text-lg font-bold text-white">
            N
          </div>
          <h1 className="text-xl font-semibold text-white">NeoAccounting</h1>
        </div>
        <div className="card space-y-4 p-6">
          <div>
            <h2 className="text-base font-semibold text-ink-800">
              {activeMembership.organizationName} is awaiting approval
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              A platform administrator needs to approve this organization before it can be used.
              You&apos;ll be able to sign in as soon as it&apos;s approved — no action is needed
              from you right now.
            </p>
          </div>
          <PendingApprovalActions otherApproved={otherApproved} />
        </div>
      </div>
    </div>
  );
}
