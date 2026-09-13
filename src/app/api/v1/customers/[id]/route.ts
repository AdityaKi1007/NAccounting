import { NextRequest, NextResponse } from "next/server";
import { getApiKeyContext, apiUnauthorized, checkApiRequestLimit } from "@/lib/api-context";
import { getRow, updateRow, validateRefFields } from "@/lib/crud";
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
  const limitError = await checkApiRequestLimit(ctx.orgId);
  if (limitError) return limitError;

  const existing = await getRow("customers", ctx.orgId, params.id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const disabled = await getDisabledFields(ctx.orgId, "customers", "update");
  const filtered = filterConfigurableFields("customers", "update", body, disabled);

  const refCheck = await validateRefFields("customers", ctx.orgId, filtered);
  if (!refCheck.valid) return NextResponse.json({ error: refCheck.error }, { status: 400 });

  const row = await updateRow("customers", ctx.orgId, params.id, filtered, { apiKeyId: ctx.apiKeyId });
  return NextResponse.json({ data: row });
}
