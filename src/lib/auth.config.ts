import type { NextAuthConfig } from "next-auth";

// Edge-safe config: no database access here. This is what middleware uses to
// decide whether a request has a valid session cookie at all. The full,
// DB-backed config (providers + callbacks that query Postgres) lives in
// auth.ts and only ever runs in the Node.js runtime (route handlers, RSCs).
export const authConfig = {
  trustHost: true,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [],
  callbacks: {
    authorized({ auth }) {
      return Boolean(auth?.user);
    },
  },
} satisfies NextAuthConfig;
