"use client";

// Shared reporter used by both DebugLogCapture.tsx (window 'error'/'unhandledrejection') and
// DebugErrorBoundary.tsx (React render crashes) — see src/lib/debug-logs.ts for the server
// side. Deliberately NOT gated on any "is debug logging on" check here: that check lives
// server-side in logException (whether this org has debug_logs_enabled), so the client always
// just reports and the server silently drops it when the feature is off — one source of truth
// for the toggle, not a client-side copy of it that could go stale mid-session if an admin
// flips the setting while this tab is already open.
//
// A simple in-memory de-dup + hard cap guards against one broken, rapidly re-rendering
// component flooding the log table with thousands of identical rows in a single page session —
// intentionally reset only on a full page reload (module-level state), not per-navigation.
const seen = new Set<string>();
const MAX_REPORTS_PER_SESSION = 25;
let reportCount = 0;

export function reportClientException(input: { message: string; stack?: string | null; componentStack?: string | null }) {
  try {
    const message = (input.message || "Unknown error").slice(0, 2000);
    const fingerprint = `${message}::${(input.stack ?? "").slice(0, 200)}`;
    if (seen.has(fingerprint)) return;
    if (reportCount >= MAX_REPORTS_PER_SESSION) return;
    seen.add(fingerprint);
    reportCount += 1;

    fetch("/api/debug-logs/client", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        stack: input.stack ?? null,
        componentStack: input.componentStack ?? null,
        url: typeof window !== "undefined" ? window.location.href : null,
      }),
      // Never block/slow down the page for this — fire and forget.
      keepalive: true,
    }).catch(() => {
      // Swallow — a failure to report an exception must never itself throw or surface to the
      // user; the whole point of this path is to be invisible when it doesn't work.
    });
  } catch {
    // Same reasoning — this function must never throw.
  }
}
