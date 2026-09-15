import { NextRequest, NextResponse } from "next/server";
import { getApiOrgContext, unauthorized } from "@/lib/api-context";
import { moduleAccessErrorResponse } from "@/lib/module-access";
import { deleteImportedTransaction } from "@/lib/bank-statement-imports";

// DELETE /api/banking/statement-imports/[id] — removes a mistaken pending row entirely (e.g.
// a bad import re-uploaded). Refuses to delete a row that's already posted — that row already
// created a real journal entry, so deleting the staging row would just orphan it silently;
// see postImportedTransaction/ignoreImportedTransaction for the other two status transitions.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  const accessError = await moduleAccessErrorResponse(ctx, "banking", "write");
  if (accessError) return accessError;

  const result = await deleteImportedTransaction(ctx.orgId, params.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  return NextResponse.json({ ok: true });
}
