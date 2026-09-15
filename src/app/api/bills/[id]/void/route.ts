import { NextRequest, NextResponse } from "next/server";
import { getApiOrgContext, unauthorized } from "@/lib/api-context";
import { moduleAccessErrorResponse } from "@/lib/module-access";
import { voidBill } from "@/lib/bills-api";

// Dedicated void action for Bills — see voidBill's own comment in bills-api.ts for why this
// isn't just a PATCH through the ordinary update route (that route always requires and
// rewrites the full line list; this is a pure status flip with nothing else to send).
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  const accessError = await moduleAccessErrorResponse(ctx, "bills", "write");
  if (accessError) return accessError;

  const result = await voidBill(ctx.orgId, params.id, { userId: ctx.userId });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  return NextResponse.json({ ok: true });
}
