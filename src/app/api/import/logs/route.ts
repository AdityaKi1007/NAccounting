import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getApiOrgContext, unauthorized } from "@/lib/api-context";
import { moduleAccessErrorResponse } from "@/lib/module-access";

function isMissingTable(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === "42P01";
}

// GET /api/import/logs[?entity=invoices] — the durable import history for this org (per the
// account owner's "log failed records under logger object" instruction, this list survives
// long after any single import request/response is gone). Newest first, optionally filtered
// to one object type.
export async function GET(req: NextRequest) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  const accessError = await moduleAccessErrorResponse(ctx, "import", "view");
  if (accessError) return accessError;

  const entity = req.nextUrl.searchParams.get("entity");
  try {
    const rows = entity
      ? await query(
          `SELECT id, entity, file_name, total_rows, success_count, failure_count, created_at
           FROM import_logs WHERE organization_id = $1 AND entity = $2 ORDER BY created_at DESC LIMIT 100`,
          [ctx.orgId, entity]
        )
      : await query(
          `SELECT id, entity, file_name, total_rows, success_count, failure_count, created_at
           FROM import_logs WHERE organization_id = $1 ORDER BY created_at DESC LIMIT 100`,
          [ctx.orgId]
        );

    return NextResponse.json({ rows });
  } catch (err) {
    // Lets the Import page render normally (with an empty history) on an environment where
    // this feature's migration (1773000000000_import_logs.js) hasn't been applied yet, instead
    // of a hard 500 — the upload/import routes still fail loudly, which is correct for a write.
    if (isMissingTable(err)) {
      console.error("import_logs table is missing — run `npm run migrate:up`. Returning empty history for now.");
      return NextResponse.json({ rows: [] });
    }
    throw err;
  }
}
