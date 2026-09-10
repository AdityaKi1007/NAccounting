import { NextRequest, NextResponse } from "next/server";
import { getApiKeyContext, apiUnauthorized } from "@/lib/api-context";
import { documentConfigs } from "@/lib/documents";
import { listDocuments, createDocument, type DocumentBody } from "@/lib/documents-api";

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
  const result = await createDocument(cfg, ctx.orgId, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  return NextResponse.json({ data: { id: result.id } }, { status: 201 });
}
