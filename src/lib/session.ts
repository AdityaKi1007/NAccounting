import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export interface ActiveContext {
  userId: string;
  userName: string;
  userEmail: string;
  orgId: string;
  orgName: string;
  role: string;
  memberships: { organizationId: string; organizationName: string; role: string }[];
}

/** Requires a logged-in user with at least one organization; redirects to /login otherwise. */
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

  return {
    userId: session.user.id,
    userName: session.user.name ?? "",
    userEmail: session.user.email ?? "",
    orgId: active.organizationId,
    orgName: active.organizationName,
    role: active.role,
    memberships,
  };
}
