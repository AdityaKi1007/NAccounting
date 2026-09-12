import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { queryOne, query } from "@/lib/db";
import { authConfig } from "@/lib/auth.config";

export interface Membership {
  organizationId: string;
  organizationName: string;
  role: string;
  // Backs the "Organization ID" shown in the org switcher / Manage Organizations page (see
  // orgDisplayId in @/lib/format) — pg returns bigint columns as strings, so this stays a
  // string all the way through the JWT/session rather than round-tripping through Number.
  orgSeq: string;
  // Custom role assigned via the per-org Roles feature (memberships.role_id) — null for the
  // default owner/admin/staff behavior (see src/lib/module-access.ts for how this is used).
  roleId: string | null;
}

interface UserRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const email = String(credentials?.email ?? "")
          .trim()
          .toLowerCase();
        const password = String(credentials?.password ?? "");
        if (!email || !password) return null;

        const user = await queryOne<UserRow>(
          `SELECT id, email, name, password_hash FROM users WHERE email = $1`,
          [email]
        );
        if (!user) return null;

        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) return null;

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user?.id) {
        token.userId = user.id;
      }
      // A newly created organization (see /api/organizations) isn't in the JWT's cached
      // memberships list yet — that list is only fetched once per session below — so the
      // caller passes refreshMemberships to force a re-fetch before (optionally) also
      // switching activeOrgId to the org it just created.
      if (trigger === "update" && session?.refreshMemberships) {
        token.memberships = undefined;
      }
      if (token.userId && !token.memberships) {
        const memberships = await query<{
          organization_id: string;
          organization_name: string;
          role: string;
          org_seq: string;
          role_id: string | null;
        }>(
          `SELECT m.organization_id, o.name AS organization_name, m.role, o.org_seq, m.role_id
           FROM memberships m
           JOIN organizations o ON o.id = m.organization_id
           WHERE m.user_id = $1
           ORDER BY m.created_at ASC`,
          [token.userId]
        );
        token.memberships = memberships.map((m) => ({
          organizationId: m.organization_id,
          organizationName: m.organization_name,
          role: m.role,
          orgSeq: m.org_seq,
          roleId: m.role_id,
        }));
        if (!token.activeOrgId && memberships.length > 0) {
          token.activeOrgId = memberships[0].organization_id;
        }
      }
      // Platform-level flag, independent of org/membership — fetched once and cached in the
      // token same as memberships above.
      if (token.userId && token.isSuperAdmin === undefined) {
        const userRow = await queryOne<{ is_super_admin: boolean }>(
          `SELECT is_super_admin FROM users WHERE id = $1`,
          [token.userId]
        );
        token.isSuperAdmin = userRow?.is_super_admin ?? false;
      }
      if (trigger === "update" && session?.activeOrgId) {
        const memberships = (token.memberships as Membership[]) ?? [];
        if (memberships.some((m) => m.organizationId === session.activeOrgId)) {
          token.activeOrgId = session.activeOrgId;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.userId as string;
      }
      session.memberships = (token.memberships as Membership[]) ?? [];
      session.activeOrgId = (token.activeOrgId as string) ?? null;
      session.isSuperAdmin = (token.isSuperAdmin as boolean) ?? false;
      return session;
    },
  },
});
