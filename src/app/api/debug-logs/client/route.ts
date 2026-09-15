import { NextRequest, NextResponse } from "next/server";
import { getApiOrgContext, unauthorized } from "@/lib/api-context";
import { logException } from "@/lib/debug-logs";

// POST /api/debug-logs/client — where DebugLogCapture.tsx (window 'error'/'unhandledrejection')
// and DebugErrorBoundary.tsx (React render crashes) report browser-side exceptions from. Any
// signed-in org member can call this (unlike the settings routes, which are Owner/Admin/Super
// Admin only) — an ordinary staff member's browser is just as likely to hit a bug as an
// admin's, and the actual "is this org even capturing debug logs" gate lives inside
// logException itself (it no-ops when the org's debug_logs_enabled is off), so a non-admin
// calling this can never write a row unless an admin already turned the feature on.
export async function POST(req: NextRequest) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();

  const body = await req.json().catch(() => ({}));
  const message = typeof body.message === "string" ? body.message : "";
  if (!message.trim()) return NextResponse.json({ error: "message is required." }, { status: 400 });

  await logException({
    orgId: ctx.orgId,
    source: "client",
    error: message,
    stackOverride: typeof body.stack === "string" ? body.stack : null,
    context: {
      url: typeof body.url === "string" ? body.url.slice(0, 500) : null,
      componentStack: typeof body.componentStack === "string" ? body.componentStack.slice(0, 4000) : null,
      userAgent: req.headers.get("user-agent"),
      userId: ctx.userId,
    },
  });

  // Always 204, whether or not anything was actually written (debug logs may be off for this
  // org) — the browser-side capture doesn't need to know or care either way.
  return new NextResponse(null, { status: 204 });
}
