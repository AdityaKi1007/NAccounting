import { NextRequest, NextResponse } from "next/server";
import { getApiOrgContext, unauthorized } from "@/lib/api-context";
import { canManageOrgSettings } from "@/lib/module-access";
import { getOrCreateNumberSeries, updateNumberSeries } from "@/lib/number-series";

export async function GET(_req: NextRequest, { params }: { params: { entityKey: string } }) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();

  const series = await getOrCreateNumberSeries(ctx.orgId, params.entityKey);
  return NextResponse.json({ series });
}

export async function PATCH(req: NextRequest, { params }: { params: { entityKey: string } }) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  if (!canManageOrgSettings(ctx)) {
    return NextResponse.json(
      { error: "Only owners and admins can update numbering preferences." },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const mode = body.mode === "manual" ? "manual" : "auto";
  const prefix = typeof body.prefix === "string" ? body.prefix : "";
  const parsedNext = Number(body.next_number);
  const nextNumber = Number.isFinite(parsedNext) && parsedNext > 0 ? Math.floor(parsedNext) : 1;
  const restartYearly = Boolean(body.restart_yearly);

  const series = await updateNumberSeries(ctx.orgId, params.entityKey, {
    mode,
    prefix,
    next_number: nextNumber,
    restart_yearly: restartYearly,
  });

  return NextResponse.json({ series });
}
