import { NextRequest, NextResponse } from "next/server";
import { getApiKeyContext, apiUnauthorized, checkApiRequestLimit } from "@/lib/api-context";
import { listRows, createRow, validateRefFields } from "@/lib/crud";
import { getDisabledFields, filterConfigurableFields } from "@/lib/api-field-config";

// Body shape for POST/PATCH mirrors the "customers" entity fields in src/lib/entities.ts —
// display_name is the only required field, e.g.
//   { display_name: "Acme LLC", email: "ap@acme.com", currency: "AED", billing_address: "..." }
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

  const customers = await listRows("customers", ctx.orgId);
  return NextResponse.json({ data: customers });
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

  const disabled = await getDisabledFields(ctx.orgId, "customers", "create");
  const filtered = filterConfigurableFields("customers", "create", body, disabled);

  const refCheck = await validateRefFields("customers", ctx.orgId, filtered);
  if (!refCheck.valid) return NextResponse.json({ error: refCheck.error }, { status: 400 });

  const row = await createRow("customers", ctx.orgId, filtered, { apiKeyId: ctx.apiKeyId });
  return NextResponse.json({ data: row }, { status: 201 });
}
