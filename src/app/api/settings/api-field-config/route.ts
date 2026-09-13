import { NextRequest, NextResponse } from "next/server";
import { getApiOrgContext, unauthorized } from "@/lib/api-context";
import {
  FIELD_CATALOG,
  ENTITY_LABELS,
  getAllDisabledFields,
  saveDisabledFields,
  type ConfigurableEntity,
  type ConfigurableOperation,
} from "@/lib/api-field-config";

// Backs the Request Payload Builder on Settings -> Integrations -> API Keys. Session-
// authenticated (this is an internal settings screen, not part of the /api/v1/* third-party
// surface) — scoped to the caller's own org exactly like every other /api/settings/* route.
//
// GET returns the full field catalog (so the UI never has to hardcode it) plus this org's
// current disabled-field set per entity/operation. PUT saves one entity/operation's disabled
// set at a time — see saveDisabledFields in api-field-config.ts for why an unknown/core field
// name is silently dropped rather than trusted.
export async function GET() {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();

  const disabled = await getAllDisabledFields(ctx.orgId);
  return NextResponse.json({ catalog: FIELD_CATALOG, labels: ENTITY_LABELS, disabled });
}

export async function PUT(req: NextRequest) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  if (ctx.role !== "owner" && ctx.role !== "admin") {
    return NextResponse.json({ error: "Only owners and admins can change the API request payload configuration." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const entity = typeof body.entity === "string" ? (body.entity as ConfigurableEntity) : undefined;
  const operation = typeof body.operation === "string" ? (body.operation as ConfigurableOperation) : undefined;
  const disabledFields: string[] = Array.isArray(body.disabledFields) ? body.disabledFields.filter((f: unknown) => typeof f === "string") : [];

  if (!entity || !operation || !FIELD_CATALOG[entity]?.[operation]) {
    return NextResponse.json({ error: "Unknown entity/operation." }, { status: 400 });
  }

  const result = await saveDisabledFields(ctx.orgId, entity, operation, disabledFields);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ ok: true });
}
