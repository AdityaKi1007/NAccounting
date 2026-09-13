import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { getApiOrgContext, unauthorized } from "@/lib/api-context";
import { moduleAccessErrorResponse } from "@/lib/module-access";

// GET /api/import/logs/[id] — one run's full per-row detail (status, error, and the row's
// original values as uploaded), scoped to the caller's own org so one org can never read
// another's import history by guessing an id.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  const accessError = await moduleAccessErrorResponse(ctx, "import", "view");
  if (accessError) return accessError;

  const log = await queryOne(
    `SELECT id, entity, file_name, total_rows, success_count, failure_count, created_at
     FROM import_logs WHERE id = $1 AND organization_id = $2`,
    [params.id, ctx.orgId]
  );
  if (!log) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rows = await query(
    `SELECT id, row_number, status, error_message, row_data, created_record_id, created_at
     FROM import_log_rows WHERE import_log_id = $1 ORDER BY row_number ASC`,
    [params.id]
  );

  return NextResponse.json({ log, rows });
}
