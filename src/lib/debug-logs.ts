import { pool, query, queryOne } from "@/lib/db";

// Backing library for the "Debug Logs" settings section (next to Usages/Audit Logs) — see
// migrations/1790000000000_debug_logs.js for the schema and the full design comment.
//
// This is intentionally NOT wired into every single route in the app — see the scope
// documented in claude/known-issues-local-env-addendum-debug-logs-2026-09-15.md (the project
// doc for this feature) for exactly which call sites feed it:
//   - src/app/api/entities/[entity]/route.ts + [id]/route.ts (generic CRUD engine — the
//     GET/POST/PATCH/DELETE handlers' own top-level try/catch, plus the pre-existing
//     journal-sync catch blocks that used to only console.error) — covers ~20 entity types.
//   - src/components/debug/DebugLogCapture.tsx (window 'error'/'unhandledrejection') and
//     DebugErrorBoundary.tsx (React render crashes), mounted once in the app shell — covers
//     100% of client-side/browser exceptions app-wide, posted to
//     /api/debug-logs/client.
// Deliberately NOT wrapped: the /api/v1/* third-party API's ~30 route files, and the
// bespoke financial engines (bills-api.ts, receipts-api.ts, payments-made-api.ts,
// credit-debit-notes-api.ts, vendor-credits-api.ts, payment-refunds-api.ts) — those already
// manage their own transactions/rollbacks internally, and wrapping their internals risked
// interfering with that; left uncovered rather than risking a change to money-movement logic.

export type DebugLogSource = "server" | "client";

export interface LogExceptionInput {
  /** Null only for the rare case an org context couldn't be resolved at all — see the
   * migration's own comment on why organization_id is nullable. */
  orgId: string | null;
  source: DebugLogSource;
  error: unknown;
  /** Overrides the stack derived from `error` — used by the client-capture route, whose
   * "error" is really just a message string reported by the browser with its own separate
   * stack field, rather than a real Error object on the server side. */
  stackOverride?: string | null;
  /** Free-form extra detail: route, method, url, entity, userAgent, componentStack, ... */
  context?: Record<string, unknown>;
}

export async function isDebugLogsEnabled(orgId: string): Promise<boolean> {
  const row = await queryOne<{ debug_logs_enabled: boolean }>(
    `SELECT debug_logs_enabled FROM organizations WHERE id = $1`,
    [orgId]
  );
  return Boolean(row?.debug_logs_enabled);
}

function toMessageAndStack(error: unknown): { message: string; stack: string | null } {
  if (error instanceof Error) return { message: error.message || "Error", stack: error.stack ?? null };
  if (typeof error === "string") return { message: error, stack: null };
  try {
    return { message: JSON.stringify(error), stack: null };
  } catch {
    return { message: String(error), stack: null };
  }
}

/**
 * Records an exception into debug_logs — a no-op (not an error) when the org hasn't turned
 * Debug Logs on, or when orgId is null and can't be checked. Never throws: a failure to write
 * the log itself must never break the real request it was trying to observe, same
 * fire-and-forget convention as api-context.ts's own usage-stat write. Safe to call from a
 * catch block without awaiting if the caller doesn't want to delay its own response — every
 * call site in this app does await it, but it's cheap (one INSERT) and won't be the slow part.
 */
export async function logException(input: LogExceptionInput): Promise<void> {
  try {
    if (!input.orgId) return;
    const enabled = await isDebugLogsEnabled(input.orgId);
    if (!enabled) return;

    const derived = toMessageAndStack(input.error);
    const message = derived.message;
    const stack = input.stackOverride !== undefined ? input.stackOverride : derived.stack;
    await pool.query(
      `INSERT INTO debug_logs (organization_id, source, message, stack, context)
       VALUES ($1, $2, $3, $4, $5)`,
      [input.orgId, input.source, message.slice(0, 4000), stack ? stack.slice(0, 8000) : null, input.context ?? null]
    );
  } catch (err) {
    // Logging the exception must never itself become the exception.
    console.error("Failed to write debug log", err);
  }
}

export interface DebugLogRow {
  id: string;
  organization_id: string | null;
  source: DebugLogSource;
  level: string;
  message: string;
  stack: string | null;
  context: Record<string, unknown> | null;
  created_at: string;
}

export async function getDebugLogs(
  orgId: string,
  opts: { limit?: number; offset?: number; source?: string } = {}
): Promise<{ data: DebugLogRow[]; total: number }> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const offset = Math.max(opts.offset ?? 0, 0);

  const conditions = ["organization_id = $1"];
  const params: unknown[] = [orgId];
  if (opts.source === "server" || opts.source === "client") {
    params.push(opts.source);
    conditions.push(`source = $${params.length}`);
  }
  params.push(limit, offset);

  const rows = await query<DebugLogRow & { total_count: string }>(
    `SELECT id, organization_id, source, level, message, stack, context, created_at, count(*) OVER() AS total_count
     FROM debug_logs
     WHERE ${conditions.join(" AND ")}
     ORDER BY created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  const total = rows.length > 0 ? Number(rows[0].total_count) : 0;
  const data = rows.map(({ total_count, ...rest }) => {
    void total_count;
    return rest;
  });
  return { data, total };
}

/** Deletes one log entry, scoped to the calling org so one organization can never delete
 * another's row by guessing an id. Returns false if it didn't exist (already gone, or
 * belongs to a different org). */
export async function deleteDebugLog(orgId: string, id: string): Promise<boolean> {
  const result = await pool.query(`DELETE FROM debug_logs WHERE id = $1 AND organization_id = $2`, [id, orgId]);
  return (result.rowCount ?? 0) > 0;
}

/** Clears every log entry for this organization ("Clear All"). */
export async function clearDebugLogs(orgId: string): Promise<number> {
  const result = await pool.query(`DELETE FROM debug_logs WHERE organization_id = $1`, [orgId]);
  return result.rowCount ?? 0;
}
