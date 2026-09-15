import { NextRequest, NextResponse } from "next/server";
import { getApiKeyContext, apiUnauthorized, checkApiRequestLimit } from "@/lib/api-context";
import { getRow, updateRow, validateRefFields } from "@/lib/crud";
import { getDisabledFields, filterConfigurableFields } from "@/lib/api-field-config";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getApiKeyContext(_req);
  if (!ctx) return apiUnauthorized();

  const unit = await getRow("inventory", ctx.orgId, params.id);
  if (!unit) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ data: unit });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getApiKeyContext(req);
  if (!ctx) return apiUnauthorized();
  const limitError = await checkApiRequestLimit(ctx.orgId);
  if (limitError) return limitError;

  const existing = await getRow("inventory", ctx.orgId, params.id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  // A PATCH that explicitly clears project_id (the other truly required field alongside
  // building_id, which — unlike project_id — may legitimately be cleared/unset) would leave a
  // row violating its own NOT NULL constraint; reject it early with a clear message instead of
  // a raw Postgres error.
  if ("project_id" in body && (body.project_id === null || body.project_id === "")) {
    return NextResponse.json({ error: "project_id can't be cleared." }, { status: 400 });
  }

  const disabled = await getDisabledFields(ctx.orgId, "units", "update");
  const filtered = filterConfigurableFields("units", "update", body, disabled);

  const refCheck = await validateRefFields("inventory", ctx.orgId, filtered);
  if (!refCheck.valid) return NextResponse.json({ error: refCheck.error }, { status: 400 });

  const row = await updateRow("inventory", ctx.orgId, params.id, filtered, { apiKeyId: ctx.apiKeyId });
  return NextResponse.json({ data: row });
}
