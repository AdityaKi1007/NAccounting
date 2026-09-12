import { NextRequest, NextResponse } from "next/server";
import { getApiOrgContext, unauthorized } from "@/lib/api-context";
import { moduleAccessErrorResponse } from "@/lib/module-access";
import { createVendorCredit, type VendorCreditBody } from "@/lib/vendor-credits-api";

export async function POST(req: NextRequest) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  const accessError = await moduleAccessErrorResponse(ctx, "vendor-credits", "write");
  if (accessError) return accessError;

  const body: VendorCreditBody = await req.json().catch(() => ({}) as VendorCreditBody);
  const result = await createVendorCredit(ctx.orgId, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  return NextResponse.json({ id: result.id }, { status: 201 });
}
