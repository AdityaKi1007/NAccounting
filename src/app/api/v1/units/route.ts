import { NextRequest, NextResponse } from "next/server";
import { getApiKeyContext, apiUnauthorized, checkApiRequestLimit } from "@/lib/api-context";
import { listRows, createRow, validateRefFields } from "@/lib/crud";
import { getDisabledFields, filterConfigurableFields } from "@/lib/api-field-config";

// Units (Property Master's `inventory` table — surfaced to users as "Units", see
// src/lib/entities.ts's own comment on the table/label naming mismatch). Body shape mirrors
// the "inventory" entity fields, e.g.
//   { name: "Unit 402", project_id: "...", building_id: "...", floor: "4", area: 1250,
//     listed_price: 950000, status: "available", unit_type: "apartment" }
//
// `name` and `project_id` are the only two truly required fields (both NOT NULL at the DB
// level with no default — see migrations/1759300000000_property_master.js). `building_id` is
// NOT required here, unlike the in-app "New Unit" form, which still asks for a Building —
// see migrations/1786000000000_units_building_optional.js's own comment for why an external
// integration may reasonably create a Unit before its Building assignment is known.
//
// Which of the optional fields below this organization's integration is actually allowed to
// send is configurable per org — see Settings -> Integrations -> API Keys' Request Payload
// Builder and src/lib/api-field-config.ts. A field the org has disabled is silently dropped
// from the incoming body below before it ever reaches createRow, not rejected as an error.
export async function GET(req: NextRequest) {
  const ctx = await getApiKeyContext(req);
  if (!ctx) return apiUnauthorized();
  const limitError = await checkApiRequestLimit(ctx.orgId);
  if (limitError) return limitError;

  const units = await listRows("inventory", ctx.orgId);
  return NextResponse.json({ data: units });
}

export async function POST(req: NextRequest) {
  const ctx = await getApiKeyContext(req);
  if (!ctx) return apiUnauthorized();
  const limitError = await checkApiRequestLimit(ctx.orgId);
  if (limitError) return limitError;

  const body = await req.json().catch(() => ({}));
  if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
    return NextResponse.json({ error: "name is required." }, { status: 400 });
  }
  if (!body.project_id || typeof body.project_id !== "string") {
    return NextResponse.json({ error: "project_id is required." }, { status: 400 });
  }

  const disabled = await getDisabledFields(ctx.orgId, "units", "create");
  const filtered = filterConfigurableFields("units", "create", body, disabled);

  const refCheck = await validateRefFields("inventory", ctx.orgId, filtered);
  if (!refCheck.valid) return NextResponse.json({ error: refCheck.error }, { status: 400 });

  const row = await createRow("inventory", ctx.orgId, filtered, { apiKeyId: ctx.apiKeyId });
  return NextResponse.json({ data: row }, { status: 201 });
}
