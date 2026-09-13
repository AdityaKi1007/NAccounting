import { NextRequest, NextResponse } from "next/server";
import { getApiOrgContext, unauthorized } from "@/lib/api-context";
import { moduleAccessErrorResponse } from "@/lib/module-access";
import { createBill, type BillBody } from "@/lib/bills-api";

// A dedicated route rather than the generic /api/documents/bills one — see bills-api.ts's
// own comment for why: per-line account_id/tax_rate_id/customer_id, which the shared
// createDocument() doesn't support.
export async function POST(req: NextRequest) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  const accessError = await moduleAccessErrorResponse(ctx, "bills", "write");
  if (accessError) return accessError;

  const body: BillBody = await req.json().catch(() => ({}) as BillBody);
  const result = await createBill(ctx.orgId, body, { userId: ctx.userId });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  return NextResponse.json({ id: result.id }, { status: 201 });
}
