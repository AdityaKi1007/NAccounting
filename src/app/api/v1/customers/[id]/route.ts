import { NextRequest, NextResponse } from "next/server";
import { getApiKeyContext, apiUnauthorized } from "@/lib/api-context";
import { getRow, updateRow } from "@/lib/crud";
import { getDisabledFields, filterConfigurableFields } from "@/lib/api-field-config";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getApiKeyContext(_req);
  if (!ctx) return apiUnauthorized();

  const customer = await getRow("customers", ctx.orgId, params.id);
  if (!customer) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ data: customer });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getApiKeyContext(req);
  if (!ctx) return apiUnauthorized();

  const existing = await getRow("customers", ctx.orgId, params.id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const disabled = await getDisabledFields(ctx.orgId, "customers", "update");
  const filtered = filterConfigurableFields("customers", "update", body, disabled);
  const row = await updateRow("customers", ctx.orgId, params.id, filtered);
  return NextResponse.json({ data: row });
}
