import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

// Edge-safe middleware: only decodes the session cookie (no DB access). The
// authoritative, DB-backed org/membership check happens in each page via
// requireActiveContext() (Node.js runtime).
export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  matcher: [
    // api/webhooks/incoming is a public, token-authenticated endpoint for external
    // services (see src/app/api/webhooks/incoming/[token]/route.ts) — it must stay
    // reachable without a NeoAccountingZ session, same as api/auth and api/signup.
    // api/v1 is the third-party REST API (see src/lib/api-context.ts's getApiKeyContext) —
    // it authenticates its own callers via an API key bearer token, not a NextAuth session
    // cookie, so it must also stay off this middleware's session-redirect path or every v1
    // call from an external system (which never carries that cookie) would get bounced to
    // /login instead of reaching the route handler.
    "/((?!api/auth|api/signup|api/webhooks/incoming|api/v1|login|signup|_next/static|_next/image|favicon.ico).*)",
  ],
};
