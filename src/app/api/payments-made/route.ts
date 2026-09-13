import { NextRequest, NextResponse } from "next/server";
import { getApiOrgContext, unauthorized } from "@/lib/api-context";
import { moduleAccessErrorResponse } from "@/lib/module-access";
import { createPaymentMade, type PaymentMadeBody } from "@/lib/payments-made-api";

// A dedicated route rather than the generic /api/entities/payments-made one — same reasoning
// as /api/payments-received: recording a payment here also allocates it across one or more
// open bills and (when saved as Paid) reduces each bill's balance_due/status, so it has to
// run as a single transaction across payments_made, bill_payment_allocations and bills. See
// payments-made-api.ts.
export async function POST(req: NextRequest) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  const accessError = await moduleAccessErrorResponse(ctx, "payments-made", "write");
  if (accessError) return accessError;

  const body: PaymentMadeBody = await req.json().catch(() => ({}) as PaymentMadeBody);
  const result = await createPaymentMade(ctx.orgId, body, { userId: ctx.userId });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  return NextResponse.json({ id: result.id }, { status: 201 });
}
