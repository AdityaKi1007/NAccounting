import { NextRequest, NextResponse } from "next/server";
import { getApiKeyContext, apiUnauthorized, checkApiRequestLimit } from "@/lib/api-context";
import { documentConfigs } from "@/lib/documents";
import { listDocuments, createDocument, getDocument, type DocumentBody } from "@/lib/documents-api";
import { getDisabledFields, filterConfigurableFields } from "@/lib/api-field-config";

const cfg = documentConfigs.invoices;

// Third-party REST API — see Settings → Integrations → API Keys for how to get a key, and
// that page for the full endpoint list. Body shape for POST/PATCH:
//   { header: { customer_id, invoice_date, due_date, status, notes, invoice_number?,
//               legal_entity_id? },
//     lines: [{ item_id?, description, quantity, rate }], taxPercent?: number }
// legal_entity_id is API-only — no field for it anywhere in the Invoice form in the app
// itself (see migrations/1779000000000_legal_entity_on_documents.js).
export async function GET(req: NextRequest) {
  const ctx = await getApiKeyContext(req);
  if (!ctx) return apiUnauthorized();
  const limitError = await checkApiRequestLimit(ctx.orgId);
  if (limitError) return limitError;

  const { searchParams } = new URL(req.url);
  const limit = searchParams.get("limit") ? Number(searchParams.get("limit")) : undefined;
  const offset = searchParams.get("offset") ? Number(searchParams.get("offset")) : undefined;

  const invoices = await listDocuments(cfg, ctx.orgId, { limit, offset });
  return NextResponse.json({ data: invoices });
}

export async function POST(req: NextRequest) {
  const ctx = await getApiKeyContext(req);
  if (!ctx) return apiUnauthorized();
  const limitError = await checkApiRequestLimit(ctx.orgId);
  if (limitError) return limitError;

  const body: DocumentBody = await req.json().catch(() => ({ header: {}, lines: [] }));
  if (body.header) {
    const disabled = await getDisabledFields(ctx.orgId, "invoices", "create");
    body.header = filterConfigurableFields("invoices", "create", body.header, disabled);
  }
  const result = await createDocument(cfg, ctx.orgId, body, { apiKeyId: ctx.apiKeyId });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  // Return the full created document (not just the id) — its header includes
  // organization_id, so a caller can confirm which tenant the record landed in, matching
  // the shape every other create endpoint in this API already returns.
  const doc = await getDocument(cfg, ctx.orgId, result.id!);
  return NextResponse.json({ data: doc }, { status: 201 });
}
