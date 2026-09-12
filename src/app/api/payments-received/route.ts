import { NextRequest, NextResponse } from "next/server";
import { getApiOrgContext, unauthorized } from "@/lib/api-context";
import { moduleAccessErrorResponse } from "@/lib/module-access";
import { createReceipt, type ReceiptBody } from "@/lib/receipts-api";

// A dedicated route rather than the generic /api/entities/payments-received one: recording a
// payment here also allocates it across one or more unpaid invoices and (when the payment is
// saved as Paid, not Draft) reduces each invoice's balance_due and flips its status, so it
// has to run as a single transaction across payments_received, payment_allocations and
// invoices. A Draft payment is still recorded for reference, but deliberately leaves invoice
// balances untouched until it's paid — this build doesn't yet offer a way to promote a draft
// payment to Paid later, so treat "Save as Draft" as a placeholder, not a two-step workflow.
//
// The actual transaction now lives in src/lib/receipts-api.ts's createReceipt(), shared with
// the third-party REST API at /api/v1/receipts so both entry points post identical, always-
// balanced payments.
export async function POST(req: NextRequest) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  const accessError = await moduleAccessErrorResponse(ctx, "payments-received", "write");
  if (accessError) return accessError;

  const body: ReceiptBody = await req.json().catch(() => ({}) as ReceiptBody);
  const result = await createReceipt(ctx.orgId, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  return NextResponse.json({ id: result.id }, { status: 201 });
}
