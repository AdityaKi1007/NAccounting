import { NextRequest, NextResponse } from "next/server";
import { getApiOrgContext, unauthorized } from "@/lib/api-context";
import { moduleAccessErrorResponse } from "@/lib/module-access";
import { updateVendorCredit, getVendorCreditForEdit, type VendorCreditBody } from "@/lib/vendor-credits-api";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  const accessError = await moduleAccessErrorResponse(ctx, "vendor-credits", "view");
  if (accessError) return accessError;

  const doc = await getVendorCreditForEdit(ctx.orgId, params.id);
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(doc);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  const accessError = await moduleAccessErrorResponse(ctx, "vendor-credits", "write");
  if (accessError) return accessError;

  const body: VendorCreditBody = await req.json().catch(() => ({}) as VendorCreditBody);
  const result = await updateVendorCredit(ctx.orgId, params.id, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  return NextResponse.json({ id: result.id });
}
