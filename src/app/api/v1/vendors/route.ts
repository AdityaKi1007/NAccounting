import { NextRequest, NextResponse } from "next/server";
import { getApiKeyContext, apiUnauthorized, checkApiRequestLimit } from "@/lib/api-context";
import { listRows, createRow, validateRefFields } from "@/lib/crud";
import { getDisabledFields, filterConfigurableFields } from "@/lib/api-field-config";

// Body shape for POST/PATCH mirrors the "vendors" entity fields in src/lib/entities.ts —
// display_name is the only required field, e.g.
//   { display_name: "Acme Supplies", email: "ap@acmesupplies.com", currency: "AED" }
//
// Which of the optional fields above this organization's integration is actually allowed to
// send is configurable per org — see Settings -> Integrations -> API Keys' Request Payload
// Builder and src/lib/api-field-config.ts. A field the org has disabled is silently dropped
// from the incoming body below before it ever reaches createRow, not rejected as an error.
export async function GET(req: NextRequest) {
  const ctx = await getApiKeyContext(req);
  if (!ctx) return apiUnauthorized();
  const limitError = await checkApiRequestLimit(ctx.orgId);
  if (limitError) return limitError;

  const vendors = await listRows("vendors", ctx.orgId);
  return NextResponse.json({ data: vendors });
}

export async function POST(req: NextRequest) {
  const ctx = await getApiKeyContext(req);
  if (!ctx) return apiUnauthorized();
  const limitError = await checkApiRequestLimit(ctx.orgId);
  if (limitError) return limitError;

  const body = await req.json().catch(() => ({}));
  if (!body.display_name || typeof body.display_name !== "string" || !body.display_name.trim()) {
    return NextResponse.json({ error: "display_name is required." }, { status: 400 });
  }

  const disabled = await getDisabledFields(ctx.orgId, "vendors", "create");
  const filtered = filterConfigurableFields("vendors", "create", body, disabled);

  const refCheck = await validateRefFields("vendors", ctx.orgId, filtered);
  if (!refCheck.valid) return NextResponse.json({ error: refCheck.error }, { status: 400 });

  const row = await createRow("vendors", ctx.orgId, filtered, { apiKeyId: ctx.apiKeyId });
  return NextResponse.json({ data: row }, { status: 201 });
}
