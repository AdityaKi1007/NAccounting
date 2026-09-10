import { NextRequest, NextResponse } from "next/server";
import { getApiKeyContext, apiUnauthorized } from "@/lib/api-context";
import { getReceipt, updateReceiptMeta } from "@/lib/receipts-api";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getApiKeyContext(_req);
  if (!ctx) return apiUnauthorized();

  const receipt = await getReceipt(ctx.orgId, params.id);
  if (!receipt) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ data: receipt });
}

// Only payment_date, payment_mode, reference_number and notes can be patched here — amount,
// allocations and status affect invoice balances and the auto-journal, so changing those
// still requires editing the payment in the app itself. See src/lib/receipts-api.ts.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getApiKeyContext(req);
  if (!ctx) return apiUnauthorized();

  const body = await req.json().catch(() => ({}));
  const result = await updateReceiptMeta(ctx.orgId, params.id, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  return NextResponse.json({ data: { id: result.id } });
}
