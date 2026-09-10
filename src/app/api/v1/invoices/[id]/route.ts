import { NextRequest, NextResponse } from "next/server";
import { getApiKeyContext, apiUnauthorized } from "@/lib/api-context";
import { documentConfigs } from "@/lib/documents";
import { getDocument, updateDocument, type DocumentBody } from "@/lib/documents-api";

const cfg = documentConfigs.invoices;

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getApiKeyContext(_req);
  if (!ctx) return apiUnauthorized();

  const doc = await getDocument(cfg, ctx.orgId, params.id);
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ data: doc });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getApiKeyContext(req);
  if (!ctx) return apiUnauthorized();

  const body: DocumentBody = await req.json().catch(() => ({ header: {}, lines: [] }));
  const result = await updateDocument(cfg, ctx.orgId, params.id, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  return NextResponse.json({ data: { id: result.id } });
}
