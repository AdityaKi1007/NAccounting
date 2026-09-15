import { NextRequest, NextResponse } from "next/server";
import { getApiOrgContext, unauthorized } from "@/lib/api-context";
import { moduleAccessErrorResponse } from "@/lib/module-access";
import { ignoreImportedTransaction } from "@/lib/bank-statement-imports";

// POST /api/banking/statement-imports/[id]/ignore — mark a staged row reviewed-but-not-posted
// (an opening-balance line, a duplicate, a statement summary row) without deleting it, so it
// stops showing under "Pending" but stays in the import's history.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  const accessError = await moduleAccessErrorResponse(ctx, "banking", "write");
  if (accessError) return accessError;

  const result = await ignoreImportedTransaction(ctx.orgId, params.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  return NextResponse.json({ ok: true });
}
