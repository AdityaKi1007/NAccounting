import { NextRequest, NextResponse } from "next/server";
import { getApiOrgContext, unauthorized } from "@/lib/api-context";
import { moduleAccessErrorResponse } from "@/lib/module-access";
import { createPaymentRefund, type PaymentRefundBody } from "@/lib/payment-refunds-api";

// Records a refund of the excess/unapplied amount on an already-Paid Payment Received (the
// "Refund" action on the receipt's own detail view — see RefundForm.tsx). A dedicated route
// rather than the generic /api/entities one: this both inserts a payment_refunds row AND
// posts its own journal entry in one transaction, and the amount is re-derived server-side
// from the receipt's current allocations/prior refunds rather than trusted from the client —
// see createPaymentRefund in payment-refunds-api.ts.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  const accessError = await moduleAccessErrorResponse(ctx, "payments-received", "write");
  if (accessError) return accessError;

  const body: PaymentRefundBody = await req.json().catch(() => ({}) as PaymentRefundBody);
  const result = await createPaymentRefund(ctx.orgId, params.id, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  return NextResponse.json({ id: result.id }, { status: 201 });
}
