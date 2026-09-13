import { NextRequest, NextResponse } from "next/server";
import { getApiKeyContext, apiUnauthorized } from "@/lib/api-context";
import { applyReceiptToInvoice, getReceipt } from "@/lib/receipts-api";

// POST /api/v1/receipts/{id}/apply — applies more of an already-recorded, Paid receipt to
// one invoice. Body: { invoice_id, amount }. Use this for a receipt that was recorded with
// no allocations at all (an "excess"/unapplied payment) or one that still has unapplied
// headroom left. See POST /api/v1/receipts/{id}/unapply for the reverse action.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getApiKeyContext(req);
  if (!ctx) return apiUnauthorized();

  const body = await req.json().catch(() => ({}));
  const invoiceId = typeof body.invoice_id === "string" ? body.invoice_id : "";
  const amount = Number(body.amount);
  if (!invoiceId) return NextResponse.json({ error: "invoice_id is required." }, { status: 400 });

  const result = await applyReceiptToInvoice(ctx.orgId, params.id, invoiceId, amount);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  // Return the full receipt (with its updated allocations), same reasoning as create/update.
  const receipt = await getReceipt(ctx.orgId, result.id!);
  return NextResponse.json({ data: receipt });
}
