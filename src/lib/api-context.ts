import { auth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { pool, queryOne } from "@/lib/db";
import { hashApiKey } from "@/lib/api-keys";

export async function getApiOrgContext() {
  const session = await auth();
  if (!session?.user) return null;
  const memberships = session.memberships ?? [];
  if (memberships.length === 0) return null;
  const orgId = session.activeOrgId ?? memberships[0].organizationId;
  const active = memberships.find((m) => m.organizationId === orgId) ?? memberships[0];
  const isSuperAdmin = session.isSuperAdmin ?? false;

  // Mirrors requireActiveContext's org-approval gate (see src/lib/session.ts) so a pending
  // org can't be driven through the API even though its pages already redirect away —
  // treated the same as "not authenticated for this org" (401) rather than a page redirect.
  if (!isSuperAdmin) {
    const org = await queryOne<{ approval_status: string }>(
      `SELECT approval_status FROM organizations WHERE id = $1`,
      [active.organizationId]
    );
    if (org && org.approval_status !== "approved") return null;
  }

  return {
    userId: session.user.id,
    orgId: active.organizationId,
    role: active.role,
    roleId: active.roleId,
    memberships,
    isSuperAdmin,
  };
}

export function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export interface ApiKeyContext {
  orgId: string;
  apiKeyId: string;
}

/**
 * Auth for the third-party REST API (/api/v1/*) — a session cookie is meaningless to an
 * external system, so these routes authenticate with a bearer API key instead, generated
 * from Settings → Integrations → API Keys. Accepts either "Authorization: Bearer <key>" or
 * an "X-API-Key: <key>" header. Every successful lookup bumps last_used_at/request_count
 * (fire-and-forget — a slow or failed usage-stat write should never fail the actual request).
 */
export async function getApiKeyContext(req: NextRequest): Promise<ApiKeyContext | null> {
  const authHeader = req.headers.get("authorization");
  const bearer = authHeader?.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : null;
  const rawKey = bearer || req.headers.get("x-api-key")?.trim();
  if (!rawKey) return null;

  const hash = hashApiKey(rawKey);
  const result = await pool.query(
    `SELECT id, organization_id FROM api_keys WHERE key_hash = $1 AND is_active = true`,
    [hash]
  );
  const row = result.rows[0];
  if (!row) return null;

  pool
    .query(`UPDATE api_keys SET last_used_at = now(), request_count = request_count + 1 WHERE id = $1`, [row.id])
    .catch((err) => console.error("Failed to record API key usage", err));

  return { orgId: row.organization_id, apiKeyId: row.id };
}

export function apiUnauthorized(message = "Invalid or missing API key. Pass it as \"Authorization: Bearer <key>\".") {
  return NextResponse.json({ error: message }, { status: 401 });
}
