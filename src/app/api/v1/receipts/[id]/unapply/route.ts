import { NextRequest, NextResponse } from "next/server";
import { getApiKeyContext, apiUnauthorized } from "@/lib/api-context";
import { unapplyReceiptAllocation, getReceipt } from "@/lib/receipts-api";

// POST /api/v1/receipts/{id}/unapply — removes this receipt's application against one
// invoice. Body: { invoice_id }. The receipt itself (and any of its other allocations) is
// untouched; the invoice's balance_due goes back up by exactly what had been applied, and
// that amount becomes available on the receipt to apply elsewhere via .../apply.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getApiKeyContext(req);
  if (!ctx) return apiUnauthorized();

  const body = await req.json().catch(() => ({}));
  const invoiceId = typeof body.invoice_id === "string" ? body.invoice_id : "";
  if (!invoiceId) return NextResponse.json({ error: "invoice_id is required." }, { status: 400 });

  const result = await unapplyReceiptAllocation(ctx.orgId, params.id, invoiceId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  // Return the full receipt (with its updated allocations), same reasoning as create/update.
  const receipt = await getReceipt(ctx.orgId, result.id!);
  return NextResponse.json({ data: receipt });
}
