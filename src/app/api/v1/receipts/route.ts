import { NextRequest, NextResponse } from "next/server";
import { getApiKeyContext, apiUnauthorized } from "@/lib/api-context";
import { listReceipts, createReceipt, type ReceiptBody } from "@/lib/receipts-api";

// "Receipts" == Payments Received. Body shape for POST:
//   { customer_id, amount, bank_account_id, payment_date?, payment_mode?, reference_number?,
//     notes?, status?: "draft"|"paid", allocations?: [{ invoice_id, amount }] }
// Allocations apply the payment to specific invoices' balance_due; omit to record an
// unapplied receipt (Zoho's "excess payment"). amount/allocations/status can't be changed
// afterwards through this API — see PATCH /api/v1/receipts/{id}.
export async function GET(req: NextRequest) {
  const ctx = await getApiKeyContext(req);
  if (!ctx) return apiUnauthorized();

  const { searchParams } = new URL(req.url);
  const limit = searchParams.get("limit") ? Number(searchParams.get("limit")) : undefined;
  const offset = searchParams.get("offset") ? Number(searchParams.get("offset")) : undefined;

  const receipts = await listReceipts(ctx.orgId, { limit, offset });
  return NextResponse.json({ data: receipts });
}

export async function POST(req: NextRequest) {
  const ctx = await getApiKeyContext(req);
  if (!ctx) return apiUnauthorized();

  const body: ReceiptBody = await req.json().catch(() => ({}) as ReceiptBody);
  const result = await createReceipt(ctx.orgId, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  return NextResponse.json({ data: { id: result.id } }, { status: 201 });
}
