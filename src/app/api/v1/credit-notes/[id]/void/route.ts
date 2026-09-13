import { NextRequest, NextResponse } from "next/server";
import { getApiKeyContext, apiUnauthorized, checkApiRequestLimit } from "@/lib/api-context";
import { voidCreditOrDebitNote, getCreditOrDebitNote } from "@/lib/credit-debit-notes-api";

// POST /api/v1/credit-notes/{id}/void — this is the "unapplication" action for credit memos:
// since a credit note is always 1:1 against a single invoice with no multi-invoice allocation
// concept (unlike receipts), void is the only sensible reverse of "apply" (= create) for this
// document type. Voiding restores the invoice's balance_due by exactly the amount this note
// actually applied (balance_applied, not its raw total — see credit-debit-notes-api.ts) and
// marks the note void; it does not delete it.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getApiKeyContext(_req);
  if (!ctx) return apiUnauthorized();
  const limitError = await checkApiRequestLimit(ctx.orgId);
  if (limitError) return limitError;

  const result = await voidCreditOrDebitNote("credit", ctx.orgId, params.id, { apiKeyId: ctx.apiKeyId });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  // Return the full voided note, same reasoning as the create endpoint above.
  const note = await getCreditOrDebitNote("credit", ctx.orgId, result.id!);
  return NextResponse.json({ data: note });
}
