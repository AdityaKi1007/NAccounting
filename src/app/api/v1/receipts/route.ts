import { NextRequest, NextResponse } from "next/server";
import { getApiKeyContext, apiUnauthorized } from "@/lib/api-context";
import { listReceipts, createReceipt, getReceipt, type ReceiptBody } from "@/lib/receipts-api";
import { getDisabledFields, filterConfigurableFields } from "@/lib/api-field-config";

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

  const rawBody: ReceiptBody = await req.json().catch(() => ({}) as ReceiptBody);
  const disabled = await getDisabledFields(ctx.orgId, "receipts", "create");
  const body = filterConfigurableFields("receipts", "create", rawBody as unknown as Record<string, unknown>, disabled) as ReceiptBody;
  const result = await createReceipt(ctx.orgId, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  // Return the full created receipt (not just the id) — its header includes
  // organization_id, so a caller can confirm which tenant the record landed in, matching
  // the shape every other create endpoint in this API already returns.
  const receipt = await getReceipt(ctx.orgId, result.id!);
  return NextResponse.json({ data: receipt }, { status: 201 });
}
