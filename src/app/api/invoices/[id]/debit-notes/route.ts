import { NextRequest, NextResponse } from "next/server";
import { getApiOrgContext, unauthorized } from "@/lib/api-context";
import { moduleAccessErrorResponse } from "@/lib/module-access";
import { createCreditOrDebitNote } from "@/lib/credit-debit-notes-api";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  const accessError = await moduleAccessErrorResponse(ctx, "debit-notes", "write");
  if (accessError) return accessError;

  const body = await req.json().catch(() => ({}));
  const result = await createCreditOrDebitNote("debit", ctx.orgId, params.id, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  return NextResponse.json({ id: result.id }, { status: 201 });
}
