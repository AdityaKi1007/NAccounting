import type { Membership } from "@/lib/auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email?: string | null;
      name?: string | null;
    };
    memberships: Membership[];
    activeOrgId: string | null;
    // Only ever set as part of the payload passed to the client's session update() call
    // (see Topbar/OrganizationsManager) — never persisted on the session itself, just read
    // once by the jwt callback to know it should re-fetch memberships from the database.
    refreshMemberships?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    memberships?: Membership[];
    activeOrgId?: string;
  }
}
