import { NextRequest, NextResponse } from "next/server";
import { getApiOrgContext, unauthorized } from "@/lib/api-context";
import { moduleAccessErrorResponse } from "@/lib/module-access";
import { updateBill, getBillForEdit, type BillBody } from "@/lib/bills-api";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  const accessError = await moduleAccessErrorResponse(ctx, "bills", "view");
  if (accessError) return accessError;

  const doc = await getBillForEdit(ctx.orgId, params.id);
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(doc);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  const accessError = await moduleAccessErrorResponse(ctx, "bills", "write");
  if (accessError) return accessError;

  const body: BillBody = await req.json().catch(() => ({}) as BillBody);
  const result = await updateBill(ctx.orgId, params.id, body, { userId: ctx.userId });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  return NextResponse.json({ id: result.id });
}
