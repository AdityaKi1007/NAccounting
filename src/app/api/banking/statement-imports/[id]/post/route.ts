import { NextRequest, NextResponse } from "next/server";
import { getApiOrgContext, unauthorized } from "@/lib/api-context";
import { moduleAccessErrorResponse } from "@/lib/module-access";
import { postImportedTransaction } from "@/lib/bank-statement-imports";

// POST /api/banking/statement-imports/[id]/post — the "Imported Transactions" review page's
// per-row (and bulk, called once per row from the client) action: pick a Chart of Accounts
// category, post it as a manual journal. See postImportedTransaction's own comment for the
// double-entry direction logic.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  const accessError = await moduleAccessErrorResponse(ctx, "banking", "write");
  if (accessError) return accessError;

  const body = await req.json().catch(() => ({}));
  const categoryAccountId = String(body.category_account_id ?? "");
  if (!categoryAccountId) return NextResponse.json({ error: "Choose a category account." }, { status: 400 });

  const result = await postImportedTransaction(ctx.orgId, params.id, categoryAccountId, { userId: ctx.userId });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  return NextResponse.json({ ok: true, journalId: result.journalId });
}
