import { NextRequest, NextResponse } from "next/server";
import { getApiKeyContext, apiUnauthorized } from "@/lib/api-context";
import { documentConfigs } from "@/lib/documents";
import { listDocuments, createDocument, getDocument, type DocumentBody } from "@/lib/documents-api";
import { getDisabledFields, filterConfigurableFields } from "@/lib/api-field-config";

const cfg = documentConfigs["sales-orders"];

// Body shape for POST/PATCH:
//   { header: { customer_id, order_date, shipment_date, status, notes, so_number? },
//     lines: [{ item_id?, description, quantity, rate }], taxPercent?: number }
export async function GET(req: NextRequest) {
  const ctx = await getApiKeyContext(req);
  if (!ctx) return apiUnauthorized();

  const { searchParams } = new URL(req.url);
  const limit = searchParams.get("limit") ? Number(searchParams.get("limit")) : undefined;
  const offset = searchParams.get("offset") ? Number(searchParams.get("offset")) : undefined;

  const salesOrders = await listDocuments(cfg, ctx.orgId, { limit, offset });
  return NextResponse.json({ data: salesOrders });
}

export async function POST(req: NextRequest) {
  const ctx = await getApiKeyContext(req);
  if (!ctx) return apiUnauthorized();

  const body: DocumentBody = await req.json().catch(() => ({ header: {}, lines: [] }));
  if (body.header) {
    const disabled = await getDisabledFields(ctx.orgId, "sales-orders", "create");
    body.header = filterConfigurableFields("sales-orders", "create", body.header, disabled);
  }
  const result = await createDocument(cfg, ctx.orgId, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  // Return the full created document (not just the id) — its header includes
  // organization_id, so a caller can confirm which tenant the record landed in, matching
  // the shape every other create endpoint in this API already returns.
  const doc = await getDocument(cfg, ctx.orgId, result.id!);
  return NextResponse.json({ data: doc }, { status: 201 });
}
